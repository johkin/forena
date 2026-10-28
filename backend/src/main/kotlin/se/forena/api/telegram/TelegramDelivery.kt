package se.forena.api.telegram

import java.util.UUID
import org.springframework.beans.factory.annotation.Value
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import se.forena.api.activities.AssistantActivityService
import se.forena.api.identity.*
import se.forena.api.notifications.InvitationChannel

data class TelegramNotification(
    val id: UUID,
    val invitationId: UUID,
    val recipientSubject: UUID,
    val body: String,
    val activityRevision: Long?,
    val invitationRevision: Long?,
)

@Service
@org.springframework.core.annotation.Order(0)
class TelegramDelivery(
    private val jdbc: JdbcClient,
    private val transactions: TransactionTemplate,
    private val identities: TelegramIdentityService,
    private val activity: AssistantActivityService,
    private val client: TelegramClient,
    private val web: BrowserSessionSettings,
    @Value("\${FORENA_TELEGRAM_DELIVERY_ENABLED:false}") private val enabled: Boolean,
) : InvitationChannel {
    override val name = "telegram"

    override fun deliver(notificationId: UUID): Boolean {
        if (!enabled || !identities.available()) return false
        if (
            jdbc
                .sql(
                    "select paused_until>clock_timestamp() from forena.telegram_transport_state where id=true"
                )
                .query(Boolean::class.java)
                .single()
        )
            return false
        return try {
            attempt(notificationId)
        } catch (_: Exception) {
            false
        }
    }

    private fun attempt(notificationId: UUID): Boolean {
        val notification =
            jdbc
                .sql(
                    "select id,invitation_id,recipient_subject,body,activity_revision,invitation_revision from forena.invitation_notification where id=:id"
                )
                .param("id", notificationId)
                .query(TelegramNotification::class.java)
                .optional()
                .orElse(null) ?: return false
        val connection =
            identities.connectionForSubject(notification.recipientSubject) ?: return false
        val actor = identities.actor(connection)
        val current = activity.invitationState(actor, notification.invitationId)
        if (
            notification.activityRevision != current.activityRevision ||
                notification.invitationRevision != current.invitationRevision
        )
            return false
        val claim =
            transactions.execute {
                val existing =
                    jdbc
                        .sql(
                            "select * from forena.telegram_invitation where notification_id=:id for update"
                        )
                        .param("id", notificationId)
                        .query(TelegramInvitation::class.java)
                        .optional()
                        .orElse(null)
                if (existing != null) return@execute existing.id to false
                val id = UUID.randomUUID()
                // Claim before I/O. A killed request is uncertain and uses fallback, never a second
                // Telegram send.
                jdbc
                    .sql(
                        "insert into forena.telegram_invitation(id,notification_id,link_id,invitation_id,invitation_revision,activity_revision,state) values(:id,:notification,:link,:invitation,:revision,:activityRevision,'uncertain')"
                    )
                    .param("id", id)
                    .param("notification", notificationId)
                    .param("link", connection.id)
                    .param("invitation", notification.invitationId)
                    .param("revision", current.invitationRevision)
                    .param("activityRevision", current.activityRevision)
                    .update()
                id to true
            } ?: return false
        val entry =
            jdbc
                .sql("select * from forena.telegram_invitation where id=:id")
                .param("id", claim.first)
                .query(TelegramInvitation::class.java)
                .single()
        if (entry.state == "sent") return true
        if (!claim.second) return false
        identities.actor(connection)
        val result =
            try {
                client.call(
                    "sendMessage",
                    mapOf(
                        "chat_id" to connection.chatId,
                        "text" to notification.body,
                        "protect_content" to true,
                        "reply_markup" to
                            mapOf(
                                "inline_keyboard" to
                                    listOf(
                                        listOf(
                                            TelegramButton(
                                                "Kommer",
                                                callback_data = "i:${claim.first}:a",
                                            ),
                                            TelegramButton(
                                                "Kan inte",
                                                callback_data = "i:${claim.first}:d",
                                            ),
                                        ),
                                        listOf(
                                            TelegramButton(
                                                "Öppna Förena",
                                                url =
                                                    "${web.origin}/activities/${current.activityId}",
                                            )
                                        ),
                                    )
                            ),
                    ),
                )
            } catch (error: org.springframework.web.server.ResponseStatusException) {
                if (error.statusCode.value() == 403) identities.disconnect(connection.subject)
                if (error.statusCode.value() == 429) {
                    val retry =
                        error.headers.getFirst("Retry-After")?.toLongOrNull()?.coerceIn(1, 86400)
                            ?: 30
                    jdbc
                        .sql(
                            "update forena.telegram_transport_state set paused_until=greatest(paused_until,clock_timestamp()+:retry*interval '1 second') where id=true"
                        )
                        .param("retry", retry)
                        .update()
                }
                return false
            }
        transactions.executeWithoutResult {
            jdbc
                .sql(
                    "update forena.telegram_invitation set state='sent',message_id=:message where id=:id and link_id=:link"
                )
                .param("message", result.path("message_id").asLong())
                .param("id", claim.first)
                .param("link", connection.id)
                .update()
        }
        return true
    }
}
