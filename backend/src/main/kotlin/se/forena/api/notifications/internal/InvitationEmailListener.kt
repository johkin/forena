package se.forena.api.notifications.internal

import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.event.TransactionalEventListener
import se.forena.api.activities.InvitationNotificationRequested
import se.forena.api.activities.ScheduledInvitationService

/**
 * Synchronous handover in the scheduler request; no background thread is required for correctness.
 */
@Component
class InvitationEmailListener(
    private val emails: InvitationEmailRepository,
    private val decisions: ScheduledInvitationService,
) {
    @TransactionalEventListener(id = "invitation-email-v1")
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    fun on(event: InvitationNotificationRequested) {
        require(event.version == 1) { "Unsupported invitation notification version" }
        val snapshot = decisions.notification(event.id)
        emails.enqueue(event.id, snapshot.recipient, snapshot.subject, snapshot.body)
    }
}
