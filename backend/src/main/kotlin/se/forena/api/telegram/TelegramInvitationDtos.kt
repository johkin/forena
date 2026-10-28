package se.forena.api.telegram

import java.time.Instant
import java.util.UUID

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

data class TelegramReceipt(val body: String, val activityId: UUID, val response: String)
