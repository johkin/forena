package se.forena.api.identity

import java.util.UUID

data class TelegramConnection(
    val id: UUID,
    val subject: UUID,
    val telegramUserId: Long,
    val chatId: Long,
    val authVersion: Long,
)

data class TelegramSettings(
    val active: Boolean,
    val available: Boolean,
    val pairingUrl: String? = null,
    val pairingExpiresAt: Long? = null,
)

data class TelegramSettingsChange(val operation: String, val consent: Boolean = false)
