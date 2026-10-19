package se.forena.api.participation

import java.util.UUID
import org.springframework.stereotype.Service
import se.forena.api.identity.Actor
import se.forena.api.identity.ActorTransactions
import se.forena.api.identity.FamilyAccess
import se.forena.api.participation.internal.ActivityRepository
import se.forena.api.participation.internal.InvitationRepository
import io.swagger.v3.oas.annotations.media.Schema

data class FamilyInvitation(
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val id: UUID,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val person_id: UUID,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val response: InvitationResponse,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED, types = ["string", "null"]) val response_comment: String?,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val name: String
)
data class FamilyInvitations(@get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val invitations: List<FamilyInvitation>)
data class ResponseChange(val response: String, val commentProvided: Boolean, val comment: String?)
class InvitationProblem(val status: Int, override val message: String) : RuntimeException(message)

@Service
class Invitations(
    private val transactions: ActorTransactions,
    private val family: FamilyAccess,
    private val activities: ActivityRepository,
    private val invitations: InvitationRepository
) {
    fun list(actor: Actor, activity: UUID): FamilyInvitations = transactions.asActor(actor) {
        val current = activities.findById(activity).orElse(null)
            ?: throw InvitationProblem(404, "Aktiviteten kunde inte hittas.")
        val people = family.people(actor, current.organizationId)
        val rows = if (people.isEmpty()) emptyList() else
            invitations.findByActivityIdAndPersonIdIn(activity, people.map { it.id })
        if (rows.isEmpty()) throw InvitationProblem(404, "Aktiviteten kunde inte hittas.")
        if (current.invitationSendAt?.isAfter(transactions.databaseTime()) == true) {
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

    fun respond(actor: Actor, invitation: UUID, change: ResponseChange) = transactions.asActor(actor) {
        // No RLS: authorize before locking, then lock the same immutable identity.
        val identity = invitations.findById(invitation).orElse(null)
            ?: throw InvitationProblem(403, "Kallelsen är inte tillgänglig.")
        if (!family.canActFor(actor, identity.personId, identity.organizationId))
            throw InvitationProblem(403, "Kallelsen är inte tillgänglig.")
        val current = invitations.findLockedByIdAndOrganizationIdAndPersonId(invitation, identity.organizationId, identity.personId)
            ?: throw InvitationProblem(403, "Kallelsen är inte tillgänglig.")
        if (!family.canActFor(actor, current.personId, current.organizationId))
            throw InvitationProblem(403, "Kallelsen är inte tillgänglig.")
        val activity = activities.findById(current.activityId).orElse(null)
            ?: throw InvitationProblem(403, "Kallelsen är inte tillgänglig.")
        val now = transactions.databaseTime()
        if (activity.status == "cancelled" || !activity.endsAt.isAfter(now))
            throw InvitationProblem(409, "Aktiviteten är inställd eller avslutad. Svaret kan inte ändras.")
        if (activity.invitationSendAt?.isAfter(now) == true)
            throw InvitationProblem(409, "Kallelsen har inte skickats ännu. Svaret kan inte ändras.")
        val comment = when {
            change.response == "pending" -> null
            change.commentProvided -> change.comment
            else -> current.responseComment
        }
        if (change.response != current.response || comment != current.responseComment) {
            try {
                transactions.bindAuditActor(actor)
                invitations.save(current.copy(response = change.response, responseComment = comment))
            } catch (ex: RuntimeException) {
                // Spring Data may propagate or wrap trigger constraints; PostgreSQL remains authoritative.
                if (generateSequence<Throwable>(ex) { it.cause }.filterIsInstance<java.sql.SQLException>()
                        .any { it.sqlState == "23514" })
                    throw InvitationProblem(409, "Kallelsen kan inte ändras just nu.")
                throw ex
            }
        }
        Unit
    }
}
