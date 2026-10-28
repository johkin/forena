package se.forena.api.telegram

import java.time.Instant
import java.util.UUID

data class TelegramGroup(
    val id: UUID,
    val teamId: UUID,
    val kind: String,
    val chatId: Long,
    val linkId: UUID,
    val inviteUrl: String,
)

data class GroupPairing(
    val fingerprint: String,
    val teamId: UUID,
    val kind: String,
    val linkId: UUID,
    val expiresAt: Instant,
)

data class GroupCommand(val kind: String)

data class GroupLink(val kind: String, val url: String)

data class GroupStart(val pairingUrl: String)
