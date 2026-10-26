package se.forena.api.activities

import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.UUID
import org.slf4j.LoggerFactory
import org.springframework.context.ApplicationEventPublisher
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import se.forena.api.activities.internal.InvitationRepository
import se.forena.api.activities.internal.ManagedActivityRepository
import se.forena.api.activities.internal.ScheduledInvitationRepository
import se.forena.api.identity.BrowserSessionSettings
import se.forena.api.identity.DatabaseClockService
import se.forena.api.identity.NotificationDirectory

/**
 * Domain decisions only. Each schedule, its invitations, checkpoints and registry rows share a
 * commit.
 */
@Service
class ScheduledInvitationService(
    private val schedules: ScheduledInvitationRepository,
    private val activities: ManagedActivityRepository,
    private val invitations: InvitationRepository,
    private val directory: NotificationDirectory,
    private val events: ApplicationEventPublisher,
    private val transaction: TransactionTemplate,
    private val clock: DatabaseClockService,
    private val web: BrowserSessionSettings,
) {
    private val logger = LoggerFactory.getLogger(ScheduledInvitationService::class.java)

    fun notification(id: UUID): InvitationNotificationSnapshot =
        schedules.notification(id)
            ?: throw NoSuchElementException("Notification snapshot unavailable")

    fun materialize(deadline: Long): Int {
        var completed = 0
        val due = transaction.execute { schedules.due(clock.now()) }.orEmpty()
        for (id in due) {
            if (Thread.currentThread().isInterrupted || System.nanoTime() >= deadline) break
            try {
                if (transaction.execute { process(id) } == true) completed++
            } catch (_: Exception) {
                // Persist retry separately after rollback, and do not expose recipient data in
                // errors.
                transaction.executeWithoutResult { schedules.fail(id, clock.now()) }
                logger.warn("invitation_materialization_failed schedule={}", id)
            }
        }
        return completed
    }

    private fun process(id: UUID): Boolean {
        val activityId = schedules.lockActivity(id) ?: return false
        val now = clock.now()
        val schedule = schedules.lockDue(id, now) ?: return false
        val activity = activities.findById(activityId).orElseThrow()
        if (
            activity.status != "scheduled" ||
                activity.startsAt <= now ||
                (schedule.kind == "reminder" && activity.responseDueAt?.let { it <= now } == true)
        ) {
            schedules.finish(id, "cancelled", now)
            return true
        }
        val context = schedules.context(activity.teamId)
        val zone = ZoneId.of(context.timeZone)
        val people = ids(schedule.personIds)
        val roles = schedule.audienceRoles.split(',').filter { it.isNotBlank() }
        val groups =
            ids(listOf(schedule.groupIds, schedule.responsibilityTypeIds).joinToString(","))
        val audience =
            schedules.audience(
                activity.teamId,
                activity.organizationId,
                activity.startsAt.atZone(zone).toLocalDate(),
                people.ifEmpty { listOf(UUID(0, 0)) },
                roles.ifEmpty { listOf("") },
                groups.ifEmpty { listOf(UUID(0, 0)) },
                people.isNotEmpty(),
                roles.isNotEmpty(),
                groups.isNotEmpty(),
            )
        check(audience.size <= 1000) { "Audience exceeds materialization limit" }
        val formattedTime =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm z").format(activity.startsAt.atZone(zone))
        var decisions = 0
        for (person in audience) {
            if (schedule.kind == "invitation") {
                invitations.create(
                    UUID.randomUUID(),
                    activity.organizationId,
                    activityId,
                    person.id,
                )
            }
            val invitation =
                invitations
                    .findByActivityIdAndPersonIdIn(activityId, listOf(person.id))
                    .singleOrNull() ?: continue
            if (schedule.kind == "reminder" && invitation.response != "pending") continue
            val recipients = directory.recipients(person.id, activity.organizationId)
            decisions += recipients.size
            check(decisions <= 1000) { "Recipient limit exceeded" }
            for (recipient in recipients) {
                val prefix = if (schedule.kind == "reminder") "Påminnelse" else "Kallelse"
                val subject = "$prefix: ${activity.title}"
                val body =
                    "${person.displayName} är kallad till ${activity.title}.\n\n" +
                        "${context.organizationName} · ${context.teamName}\n$formattedTime\n" +
                        "${activity.location}\n\nÖppna Förena för detaljer och svar:\n" +
                        "${web.origin}/activities/$activityId\n"
                val notification =
                    schedules.checkpoint(
                        UUID.randomUUID(),
                        id,
                        invitation.id,
                        recipient.subject,
                        now,
                        recipient.email,
                        subject,
                        body,
                    ) ?: continue
                events.publishEvent(InvitationNotificationRequested(notification))
            }
        }
        schedules.finish(id, "completed", now)
        return true
    }

    private fun ids(value: String): List<UUID> =
        value.split(',').filter { it.isNotBlank() }.map(UUID::fromString)
}
