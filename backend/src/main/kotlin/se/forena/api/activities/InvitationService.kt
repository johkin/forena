package se.forena.api.activities

import java.util.UUID
import org.springframework.security.access.AccessDeniedException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import se.forena.api.activities.internal.ActivityRepository
import se.forena.api.activities.internal.ActivitySignalEntity
import se.forena.api.activities.internal.ActivitySignalRepository
import se.forena.api.activities.internal.InvitationEntity
import se.forena.api.activities.internal.InvitationHistoryEntity
import se.forena.api.activities.internal.InvitationHistoryRepository
import se.forena.api.activities.internal.InvitationRepository
import se.forena.api.identity.Actor
import se.forena.api.identity.DatabaseClockService
import se.forena.api.identity.PersonAccessService
import se.forena.api.identity.SessionService

@Service
class InvitationService(
    private val sessions: SessionService,
    private val clock: DatabaseClockService,
    private val access: PersonAccessService,
    private val activities: ActivityRepository,
    private val invitations: InvitationRepository,
    private val history: InvitationHistoryRepository,
    private val signals: ActivitySignalRepository,
    private val management: ActivityManagementService,
) {
    @Transactional(readOnly = true)
    fun list(actor: Actor, activity: UUID): MyInvitations {
        sessions.requireActive(actor)
        val current =
            activities.findById(activity).orElse(null)
                ?: throw NoSuchElementException("Aktiviteten kunde inte hittas.")
        if (current.deletedAt != null)
            throw NoSuchElementException("Aktiviteten kunde inte hittas.")
        val people = access.people(actor, current.organizationId)
        val rows =
            if (people.isEmpty()) emptyList()
            else invitations.findByActivityIdAndPersonIdIn(activity, people.map { it.id })
        if (rows.isEmpty()) throw NoSuchElementException("Aktiviteten kunde inte hittas.")
        return if (current.invitationSendAt?.isAfter(clock.now()) == true) {
            MyInvitations(emptyList())
        } else {
            val byPerson = rows.associateBy { it.personId }
            val result = people.mapNotNull { person ->
                byPerson[person.id]?.let { invitation ->
                    AccessibleInvitation(
                        invitation.id,
                        person.id,
                        InvitationResponse.fromDatabase(invitation.response),
                        invitation.responseComment,
                        person.name,
                    )
                }
            }
            // Repository orders names using the database's collation; retain the prior UUID
            // tie-break.
            MyInvitations(
                result
                    .groupBy { it.name }
                    .values
                    .flatMap { it.sortedBy { row -> row.id.toString() } }
            )
        }
    }

    private class AdmittedResponse(
        val identity: InvitationEntity,
        val teamId: UUID,
        val canOverrideDeadline: Boolean,
    )

    @Transactional
    fun respond(actor: Actor, invitation: UUID, change: ResponseChange) {
        sessions.requireActive(actor)
        val admission = admit(actor, invitation)
        writeResponse(actor, admission, change)
    }

    @Transactional
    fun respondBatch(
        actor: Actor,
        changes: List<Pair<UUID, ResponseChange>>,
        expected: Map<UUID, Long>,
    ) {
        sessions.requireActive(actor)
        require(changes.isNotEmpty() && changes.map { it.first }.distinct().size == changes.size)
        require(expected.keys == changes.map { it.first }.toSet())
        val admitted = changes.associate { it.first to admit(actor, it.first) }
        // Admit the complete batch before waiting; retain one stable lock order for all rows.
        admitted.values
            .map { it.identity.activityId }
            .distinct()
            .sorted()
            .forEach { id ->
                val identity = admitted.values.first { it.identity.activityId == id }.identity
                activities.findLockedByIdAndOrganizationId(id, identity.organizationId)
                    ?: throw AccessDeniedException("Kallelsen är inte tillgänglig.")
            }
        admitted.entries
            .sortedBy { it.key }
            .forEach { (id, admission) ->
                val identity = admission.identity
                val current =
                    invitations.findLockedByIdAndOrganizationIdAndActivityIdAndPersonId(
                        id,
                        identity.organizationId,
                        identity.activityId,
                        identity.personId,
                    ) ?: throw AccessDeniedException("Kallelsen är inte tillgänglig.")
                check(current.revision == expected[id])
            }
        changes.forEach { (id, change) -> writeResponse(actor, admitted.getValue(id), change) }
    }

    private fun admit(actor: Actor, invitation: UUID): AdmittedResponse {
        val identity =
            invitations.findById(invitation).orElse(null)
                ?: throw AccessDeniedException("Kallelsen är inte tillgänglig.")
        if (!access.canActFor(actor, identity.personId, identity.organizationId))
            throw AccessDeniedException("Kallelsen är inte tillgänglig.")
        val activity =
            activities.findById(identity.activityId).orElseThrow { NoSuchElementException() }
        return AdmittedResponse(
            identity,
            activity.teamId,
            management.canManageActivity(actor, activity.teamId),
        )
    }

    private fun writeResponse(actor: Actor, admission: AdmittedResponse, change: ResponseChange) {
        val identity = admission.identity
        val activity =
            activities.findLockedByIdAndOrganizationId(identity.activityId, identity.organizationId)
                ?: throw AccessDeniedException("Kallelsen är inte tillgänglig.")
        val current =
            invitations.findLockedByIdAndOrganizationIdAndActivityIdAndPersonId(
                requireNotNull(identity.id),
                identity.organizationId,
                identity.activityId,
                identity.personId,
            ) ?: throw AccessDeniedException("Kallelsen är inte tillgänglig.")
        check(activity.teamId == admission.teamId)
        val now = clock.now()
        if (activity.status == "cancelled" || !activity.endsAt.isAfter(now))
            throw IllegalStateException(
                "Aktiviteten är inställd eller avslutad. Svaret kan inte ändras."
            )
        if (activity.invitationSendAt?.isAfter(now) == true)
            throw IllegalStateException("Kallelsen har inte skickats ännu. Svaret kan inte ändras.")
        if (
            activity.responseDueAt?.let { !it.isAfter(now) } == true &&
                !admission.canOverrideDeadline
        )
            throw IllegalStateException("Svarstiden har gått ut. Svaret kan inte ändras.")
        val comment =
            when {
                change.response == "pending" -> null
                change.commentProvided ->
                    change.comment
                        ?.trim()
                        ?.codePoints()
                        ?.limit(500)
                        ?.toArray()
                        ?.let { String(it, 0, it.size) }
                        ?.ifEmpty { null }
                else -> current.responseComment
            }
        if (change.response != current.response || comment != current.responseComment) {
            try {
                val responseChanged = change.response != current.response
                val updated =
                    current.copy(
                        response = change.response,
                        responseComment = comment,
                        respondedAt =
                            when {
                                change.response == "pending" -> null
                                responseChanged -> now
                                else -> current.respondedAt
                            },
                        revision = current.revision + 1,
                    )
                invitations.save(updated)
                history.save(
                    InvitationHistoryEntity(
                        invitationId = current.id,
                        organizationId = current.organizationId,
                        actorSubject = actor.subject,
                        channel = actor.channel,
                        changedAt = now,
                        previousResponse = current.response,
                        response = updated.response,
                        revision = updated.revision,
                    )
                )
                if (responseChanged) {
                    val signal = signals.findById(current.activityId).orElse(null)
                    signals.save(
                        if (signal == null)
                            ActivitySignalEntity(current.activityId, 1, now, newRecord = true)
                        else signal.copy(dirtyRevision = signal.dirtyRevision + 1, changedAt = now)
                    )
                }
            } catch (ex: RuntimeException) {
                // Preserve atomic rollback if a database constraint rejects any of the writes.
                if (
                    generateSequence<Throwable>(ex) { it.cause }
                        .filterIsInstance<java.sql.SQLException>()
                        .any { it.sqlState == "23514" }
                )
                    throw IllegalStateException("Kallelsen kan inte ändras just nu.")
                throw ex
            }
        }
    }
}
