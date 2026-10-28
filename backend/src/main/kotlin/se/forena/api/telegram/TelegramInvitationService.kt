package se.forena.api.telegram

import java.util.UUID
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.access.AccessDeniedException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import se.forena.api.activities.*
import se.forena.api.identity.*

data class TelegramInvitation(
    val id: UUID,
    val notificationId: UUID,
    val linkId: UUID,
    val invitationId: UUID,
    val invitationRevision: Long,
    val activityRevision: Long,
    val messageId: Long?,
    val lastUpdate: Long,
    val state: String,
    val nextAttempt: java.time.Instant,
)

@Service
class TelegramInvitationService(
    private val jdbc: JdbcClient,
    private val identities: TelegramIdentityService,
    private val activities: AssistantActivityService,
    private val invitations: InvitationService,
) {
    fun activityForReply(connection: TelegramConnection, message: Long): UUID? {
        val row =
            jdbc
                .sql(
                    "select * from forena.telegram_invitation where link_id=:link and message_id=:message and state='sent'"
                )
                .param("link", connection.id)
                .param("message", message)
                .query(TelegramInvitation::class.java)
                .optional()
                .orElse(null) ?: return null
        return activities.invitationState(identities.actor(connection), row.invitationId).activityId
    }

    @Transactional
    fun respond(
        connection: TelegramConnection,
        message: Long,
        id: UUID,
        accepted: Boolean,
        update: Long,
    ): String {
        val actor = identities.actor(connection)
        val identity =
            jdbc
                .sql(
                    "select * from forena.telegram_invitation where id=:id and link_id=:link and message_id=:message and state='sent'"
                )
                .param("id", id)
                .param("link", connection.id)
                .param("message", message)
                .query(TelegramInvitation::class.java)
                .optional()
                .orElseThrow { AccessDeniedException("Unavailable button") }
        val initial = activities.invitationState(actor, identity.invitationId)
        activities.lockActivity(actor, initial.activityId)
        val row =
            jdbc
                .sql(
                    "select * from forena.telegram_invitation where id=:id and link_id=:link for update"
                )
                .param("id", id)
                .param("link", connection.id)
                .query(TelegramInvitation::class.java)
                .single()
        val current = activities.invitationState(actor, row.invitationId)
        check(
            update > row.lastUpdate &&
                current.activityRevision == row.activityRevision &&
                current.invitationRevision == row.invitationRevision
        )
        val response = if (accepted) "accepted" else "declined"
        activities.respond(
            actor,
            listOf(current.invitationId to ResponseChange(response, false, null)),
            mapOf(current.invitationId to current.invitationRevision),
            invitations,
        )
        val after = activities.invitationState(actor, current.invitationId)
        jdbc
            .sql(
                "update forena.telegram_invitation set invitation_revision=:revision,last_update=:update where id=:id"
            )
            .param("revision", after.invitationRevision)
            .param("update", update)
            .param("id", id)
            .update()
        return "${current.personName} ${if (accepted) "kommer" else "kan inte komma"}."
    }

    fun receipt(connection: TelegramConnection, id: UUID): TelegramReceipt {
        val row =
            jdbc
                .sql("select * from forena.telegram_invitation where id=:id and link_id=:link")
                .param("id", id)
                .param("link", connection.id)
                .query(TelegramInvitation::class.java)
                .single()
        val state = activities.invitationState(identities.actor(connection), row.invitationId)
        val body =
            jdbc
                .sql("select body from forena.invitation_notification where id=:id")
                .param("id", row.notificationId)
                .query(String::class.java)
                .single()
        return TelegramReceipt(body, state.activityId, state.response)
    }
}

data class TelegramReceipt(val body: String, val activityId: UUID, val response: String)
