package se.forena.api.activities

import java.util.UUID

/** Immutable v1 decision. Transport retries never reload business rules or rebuild the message. */
data class InvitationNotificationRequested(
    val id: UUID,
    val version: Int = 1,
)

data class InvitationNotificationSnapshot(
    val id: UUID,
    val recipient: String,
    val subject: String,
    val body: String,
)
