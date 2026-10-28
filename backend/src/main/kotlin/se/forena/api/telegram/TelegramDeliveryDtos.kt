package se.forena.api.telegram

import java.util.UUID

data class TelegramNotification(
    val id: UUID,
    val invitationId: UUID,
    val recipientSubject: UUID,
    val body: String,
    val activityRevision: Long?,
    val invitationRevision: Long?,
)
