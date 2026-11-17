package se.forena.api.identity.internal

import java.time.Instant
import java.util.UUID

data class AccountLifecycleRow(val activatedAt: Instant?, val disconnectedAt: Instant?, val reminderSent: Boolean, val connectionUntil: Instant?)

data class AccountConnection(val id: UUID, val name: String, val until: Instant)

data class FollowerTarget(val organizationId: UUID, val email: String?)

data class FollowerRow(
    val id: UUID, val personId: UUID, val organizationId: UUID, val organizationName: String,
    val personName: String, val requester: String, val state: String, val incoming: Boolean, val expiresAt: Instant,
)

data class PendingEmail(val email: String, val authVersion: Long, val sessionId: String, val expiresAt: Instant)
