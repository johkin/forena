package se.forena.api.notifications

import java.util.Locale
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component

/** This delivery release is deliberately limited to explicitly allowlisted test accounts. */
@Component
class NotificationSettings(
    @Value("\${forena.notifications.enabled:false}") val enabled: Boolean,
    @Value("\${forena.notifications.worker-token:}") val workerToken: String,
    @Value("\${forena.notifications.test-recipients:}") testRecipients: String,
) {
    private val recipients =
        testRecipients
            .split(',')
            .map { it.trim().lowercase(Locale.ROOT) }
            .filter { it.isNotEmpty() }
            .toSet()

    init {
        if (enabled) {
            require(workerToken.length >= 32 && workerToken.none { it.isWhitespace() }) {
                "Configure a separate notification worker token of at least 32 characters"
            }
            require(recipients.isNotEmpty() && recipients.all { it.contains('@') }) {
                "Configure notification test recipients before enabling delivery"
            }
        }
    }

    fun allows(email: String): Boolean = enabled && email.lowercase(Locale.ROOT) in recipients
}
