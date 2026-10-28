package se.forena.api.telegram

import java.util.UUID
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import se.forena.api.activities.AssistantActivityService
import se.forena.api.identity.*
import se.forena.api.notifications.InvitationChannel
import se.forena.api.telegram.internal.TelegramDeliveryRepository

@Service
@org.springframework.core.annotation.Order(0)
class TelegramDelivery(
    private val repository: TelegramDeliveryRepository,
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
        if (repository.isPaused()) return false
        return try {
            attempt(notificationId)
        } catch (_: Exception) {
            false
        }
    }

    private fun attempt(notificationId: UUID): Boolean {
        val notification = repository.findNotification(notificationId).orElse(null) ?: return false
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
                val existing = repository.findLockedNotification(notificationId).orElse(null)
                if (existing != null) return@execute existing.id to false
                val id = UUID.randomUUID()
                // Claim before I/O. A killed request is uncertain and uses fallback, never a second
                // Telegram send.
                repository.claimDelivery(
                    id,
                    notificationId,
                    connection.id,
                    notification.invitationId,
                    current.invitationRevision,
                    current.activityRevision,
                )
                id to true
            } ?: return false
        val entry = repository.findDelivery(claim.first)
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
                    repository.pause(retry)
                }
                return false
            }
        transactions.executeWithoutResult {
            repository.markSent(result.path("message_id").asLong(), claim.first, connection.id)
        }
        return true
    }
}
