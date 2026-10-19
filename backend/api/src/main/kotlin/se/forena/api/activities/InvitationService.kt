package se.forena.api.activities

import java.util.UUID
import org.springframework.stereotype.Service
import se.forena.api.identity.Actor
import se.forena.api.identity.SessionService
import se.forena.api.identity.DatabaseClockService
import org.springframework.transaction.annotation.Transactional
import se.forena.api.identity.FamilyAccessService
import se.forena.api.activities.internal.ActivityRepository
import se.forena.api.activities.internal.InvitationRepository
import se.forena.api.activities.internal.InvitationHistoryRecord
import se.forena.api.activities.internal.InvitationHistoryRepository
import se.forena.api.activities.internal.ActivitySignalRecord
import se.forena.api.activities.internal.ActivitySignalRepository

@Service
class InvitationService(
    private val sessions: SessionService,
    private val clock: DatabaseClockService,
    private val family: FamilyAccessService,
    private val activities: ActivityRepository,
    private val invitations: InvitationRepository,
    private val history: InvitationHistoryRepository,
    private val signals: ActivitySignalRepository
) {
    @Transactional(readOnly = true)
    fun list(actor: Actor, activity: UUID): FamilyInvitations {
        sessions.requireActive(actor)
        val current = activities.findById(activity).orElse(null)
            ?: throw InvitationProblem(404, "Aktiviteten kunde inte hittas.")
        val people = family.people(actor, current.organizationId)
        val rows = if (people.isEmpty()) emptyList() else
            invitations.findByActivityIdAndPersonIdIn(activity, people.map { it.id })
        if (rows.isEmpty()) throw InvitationProblem(404, "Aktiviteten kunde inte hittas.")
        return if (current.invitationSendAt?.isAfter(clock.now()) == true) {
            FamilyInvitations(emptyList())
        } else {
            val byPerson = rows.associateBy { it.personId }
            val result = people.mapNotNull { person -> byPerson[person.id]?.let { invitation ->
                FamilyInvitation(invitation.id, person.id, InvitationResponse.fromDatabase(invitation.response),
                    invitation.responseComment, person.name)
            } }
            // Repository orders names using the database's collation; retain the prior UUID tie-break.
            FamilyInvitations(result.groupBy { it.name }.values.flatMap { it.sortedBy { row -> row.id.toString() } })
        }
    }

    @Transactional
    fun respond(actor: Actor, invitation: UUID, change: ResponseChange) {
        sessions.requireActive(actor)
        // No RLS: authorize before locking, then lock the same immutable identity.
        val identity = invitations.findById(invitation).orElse(null)
            ?: throw InvitationProblem(403, "Kallelsen är inte tillgänglig.")
        if (!family.canActFor(actor, identity.personId, identity.organizationId))
            throw InvitationProblem(403, "Kallelsen är inte tillgänglig.")
        // Consistent lock order: activity, then invitation. The activity lock also serializes
        // creation/increment of the shared signal row when different invitations change.
        val activity = activities.findLockedByIdAndOrganizationId(identity.activityId, identity.organizationId)
            ?: throw InvitationProblem(403, "Kallelsen är inte tillgänglig.")
        val current = invitations.findLockedByIdAndOrganizationIdAndActivityIdAndPersonId(
            invitation, identity.organizationId, identity.activityId, identity.personId)
            ?: throw InvitationProblem(403, "Kallelsen är inte tillgänglig.")
        if (!family.canActFor(actor, current.personId, current.organizationId))
            throw InvitationProblem(403, "Kallelsen är inte tillgänglig.")
        val now = clock.now()
        if (activity.status == "cancelled" || !activity.endsAt.isAfter(now))
            throw InvitationProblem(409, "Aktiviteten är inställd eller avslutad. Svaret kan inte ändras.")
        if (activity.invitationSendAt?.isAfter(now) == true)
            throw InvitationProblem(409, "Kallelsen har inte skickats ännu. Svaret kan inte ändras.")
        val comment = when {
            change.response == "pending" -> null
            change.commentProvided -> change.comment?.trim()
                ?.codePoints()?.limit(500)?.toArray()?.let { String(it, 0, it.size) }?.ifEmpty { null }
            else -> current.responseComment
        }
        if (change.response != current.response || comment != current.responseComment) {
            try {
                val responseChanged = change.response != current.response
                val updated = current.copy(response = change.response, responseComment = comment,
                    respondedAt = when {
                        change.response == "pending" -> null
                        responseChanged -> now
                        else -> current.respondedAt
                    }, revision = current.revision + 1)
                invitations.save(updated)
                history.save(InvitationHistoryRecord(invitationId = current.id, organizationId = current.organizationId,
                    actorSubject = actor.subject, channel = "web", changedAt = now,
                    previousResponse = current.response, response = updated.response, revision = updated.revision))
                if (responseChanged) {
                    val signal = signals.findById(current.activityId).orElse(null)
                    signals.save(if (signal == null) ActivitySignalRecord(current.activityId, 1, now, newRecord = true)
                        else signal.copy(dirtyRevision = signal.dirtyRevision + 1, changedAt = now))
                }
            } catch (ex: RuntimeException) {
                // Preserve atomic rollback if a database constraint rejects any of the writes.
                if (generateSequence<Throwable>(ex) { it.cause }.filterIsInstance<java.sql.SQLException>()
                        .any { it.sqlState == "23514" })
                    throw InvitationProblem(409, "Kallelsen kan inte ändras just nu.")
                throw ex
            }
        }
    }
}
