package se.forena.api.notifications

import java.util.UUID

/** Alternative transports respect the same immutable recipient decision. */
interface InvitationChannel {
    val name: String

    fun deliver(notificationId: UUID): Boolean
}
