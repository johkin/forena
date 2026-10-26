package se.forena.api.identity

import java.util.UUID
import org.springframework.stereotype.Service
import se.forena.api.identity.internal.NotificationRecipientRepository

/** Only verified, enabled accounts with current explicit person access receive a decision. */
@Service
class NotificationDirectory(private val recipients: NotificationRecipientRepository) {
    fun recipients(person: UUID, organization: UUID): List<NotificationRecipient> =
        recipients.forPerson(person, organization)
}
