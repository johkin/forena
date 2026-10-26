package se.forena.api.notifications.internal

import java.time.Duration
import java.time.Instant
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import se.forena.api.email.EmailDeliveryResult
import se.forena.api.email.EmailMessage
import se.forena.api.email.EmailSender
import se.forena.api.identity.DatabaseClockService
import se.forena.api.notifications.NotificationSettings

/** Persist the attempt before HTTP. A killed request leaves a lease and the same provider key. */
@Service
class InvitationEmailDelivery(
    private val emails: InvitationEmailRepository,
    private val transaction: TransactionTemplate,
    private val sender: EmailSender,
    private val clock: DatabaseClockService,
    private val settings: NotificationSettings,
) {
    fun deliverOne(): Boolean {
        if (!settings.enabled) return false
        val claim = transaction.execute { claim() } ?: return false
        if (claim.state != "pending") return true
        val result =
            sender.send(
                EmailMessage(
                    claim.recipient,
                    claim.subject,
                    claim.body,
                    "invitation/${claim.id}",
                )
            )
        transaction.executeWithoutResult {
            val now = clock.now()
            when (result) {
                is EmailDeliveryResult.Accepted ->
                    emails.conclude(
                        claim.id,
                        claim.attempts,
                        "accepted",
                        now,
                        result.messageId,
                        now,
                        null,
                    )
                EmailDeliveryResult.Rejected ->
                    emails.conclude(
                        claim.id,
                        claim.attempts,
                        "failed",
                        now,
                        null,
                        null,
                        "provider_rejected",
                    )
                is EmailDeliveryResult.Retry -> {
                    val delay =
                        maxOf(30L shl (claim.attempts - 1), result.afterSeconds.coerceIn(0, 86400))
                    val next = now.plusSeconds(delay)
                    val exhausted = claim.attempts >= 5 || outsideWindow(claim.firstAttemptAt, next)
                    emails.conclude(
                        claim.id,
                        claim.attempts,
                        if (exhausted) "uncertain" else "pending",
                        next,
                        null,
                        null,
                        if (exhausted) "retry_window_exhausted" else "provider_retry",
                    )
                }
            }
        }
        return true
    }

    private fun claim(): InvitationEmailEntity? {
        val now = clock.now()
        val email = emails.lockDue(now) ?: return null
        if (email.attempts >= 5 || outsideWindow(email.firstAttemptAt, now)) {
            return emails.save(
                email.copy(state = "uncertain", lastError = "retry_window_exhausted")
            )
        }
        if (!settings.allows(email.recipient)) {
            return emails.save(
                email.copy(state = "suppressed", lastError = "recipient_not_allowlisted")
            )
        }
        // The 120-second lease exceeds the 5s connect + 10s read timeouts and request budget.
        return emails.save(
            email.copy(
                attempts = email.attempts + 1,
                firstAttemptAt = email.firstAttemptAt ?: now,
                nextAttempt = now.plusSeconds(120),
            )
        )
    }

    // Resend retains keys for 24h. Stop an hour early rather than risk a second send after expiry.
    private fun outsideWindow(first: Instant?, now: Instant): Boolean =
        first != null && !now.isBefore(first.plus(Duration.ofHours(23)))
}
