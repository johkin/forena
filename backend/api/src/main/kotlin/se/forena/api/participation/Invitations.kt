package se.forena.api.participation

import java.util.UUID
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import se.forena.api.identity.Actor
import se.forena.api.identity.ActorTransactions
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
class Invitations(private val transactions: ActorTransactions, private val jdbc: JdbcTemplate) {
    fun list(actor: Actor, activity: UUID): FamilyInvitations = transactions.asActor(actor) {
        val rows = jdbc.query("""
            select a.invitation_send_at is null or a.invitation_send_at<=clock_timestamp() as sent
            from forena.activity a where a.id=? and exists(
              select 1 from forena.invitation i join forena.person_access p
                on p.person_id=i.person_id and p.organization_id=i.organization_id
              where i.activity_id=a.id and i.organization_id=a.organization_id and p.subject=? and p.active)
        """.trimIndent(), { rs, _ -> rs.getBoolean("sent") }, activity, actor.subject)
        if (rows.isEmpty()) throw InvitationProblem(404, "Aktiviteten kunde inte hittas.")
        if (!rows.single()) FamilyInvitations(emptyList()) else FamilyInvitations(jdbc.query("""
            select i.id,i.person_id,i.response,i.response_comment,p.display_name
            from forena.invitation i join forena.person p on p.id=i.person_id and p.organization_id=i.organization_id
            join forena.person_access access on access.person_id=i.person_id and access.organization_id=i.organization_id
            where i.activity_id=? and access.subject=? and access.active order by p.display_name,i.id
        """.trimIndent(), { rs, _ -> FamilyInvitation(rs.getObject("id", UUID::class.java),
            rs.getObject("person_id", UUID::class.java), InvitationResponse.fromDatabase(rs.getString("response")),
            rs.getString("response_comment"), rs.getString("display_name")) }, activity, actor.subject))
    }

    fun respond(actor: Actor, invitation: UUID, change: ResponseChange) = transactions.asActor(actor) {
        // Serialize repeated/concurrent responses. RLS filters both the lock and the write.
        val rows = jdbc.query("""
            select a.status='cancelled' or a.ends_at<=clock_timestamp() as closed,
                   a.invitation_send_at>clock_timestamp() as unsent
            from forena.invitation i join forena.activity a on a.id=i.activity_id and a.organization_id=i.organization_id
            join forena.person_access access on access.person_id=i.person_id and access.organization_id=i.organization_id
            where i.id=? and access.subject=? and access.active for update of i
        """.trimIndent(), { rs, _ -> Pair(rs.getBoolean("closed"), rs.getBoolean("unsent")) }, invitation, actor.subject)
        if (rows.isEmpty()) throw InvitationProblem(403, "Kallelsen är inte tillgänglig.")
        if (rows.single().first) throw InvitationProblem(409, "Aktiviteten är inställd eller avslutad. Svaret kan inte ändras.")
        if (rows.single().second) throw InvitationProblem(409, "Kallelsen har inte skickats ännu. Svaret kan inte ändras.")
        try {
            jdbc.update("""
                update forena.invitation set response=?, response_comment=case
                when ?='pending' then null when ? then ? else response_comment end where id=?
            """.trimIndent(), change.response, change.response, change.commentProvided, change.comment, invitation)
        } catch (ex: DataIntegrityViolationException) {
            // Lifecycle can change between the read and the database's locked lifecycle check.
            if ((ex.mostSpecificCause as? java.sql.SQLException)?.sqlState == "23514")
                throw InvitationProblem(409, "Kallelsen kan inte ändras just nu.")
            throw ex
        }
        Unit
    }
}
