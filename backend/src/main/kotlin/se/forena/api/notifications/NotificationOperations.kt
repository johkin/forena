package se.forena.api.notifications

import java.time.Instant
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import se.forena.api.notifications.internal.InvitationEmailRepository

data class NotificationStatus(
    val pendingSchedules: Long,
    val failedSchedules: Long,
    val pendingEmails: Long,
    val failedEmails: Long,
    val uncertainEmails: Long,
    val suppressedEmails: Long,
    val incompletePublications: Long,
    val oldestEmailSeconds: Long?,
    val startedAt: Instant?,
    val completedAt: Instant?,
)

/**
 * Aggregate operational data only; no recipient addresses, message text or scheduler credentials.
 */
@Service
class NotificationOperations(private val emails: InvitationEmailRepository) {
    @Transactional fun started() = emails.started()

    @Transactional fun completed() = emails.completed()

    @Transactional(readOnly = true) fun status(): NotificationStatus = emails.status()
}
