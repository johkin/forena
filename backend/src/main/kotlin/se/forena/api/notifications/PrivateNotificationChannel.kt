package se.forena.api.notifications

import se.forena.api.extensionapi.PrivateExtensionMessage

/** Private channel transports; ownership and deduplication remain in the outbox. */
interface PrivateNotificationChannel {
    fun deliverPrivate(message: PrivateExtensionMessage): Boolean
}
