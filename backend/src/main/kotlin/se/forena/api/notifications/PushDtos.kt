package se.forena.api.notifications

import java.util.UUID

// Subscription secrets are private transport data, never returned by a settings endpoint.
class PushSubscription(
    val id: UUID,
    val subject: UUID,
    val endpoint: String,
    val p256dh: String,
    val auth: String,
)

data class PushKeys(val p256dh: String, val auth: String)

data class PushCommand(val endpoint: String, val keys: PushKeys? = null)

data class PushSettings(val available: Boolean, val publicKey: String)
