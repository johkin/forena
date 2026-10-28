package se.forena.api.telegram

import java.time.temporal.ChronoUnit
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import se.forena.api.identity.DatabaseClockService
import se.forena.api.telegram.internal.TelegramWebhookRepository

@Service
class TelegramUpdateRetentionService(
    private val repository: TelegramWebhookRepository,
    private val clock: DatabaseClockService,
) {
    /** Keep seven days of deduplication, including failed or interrupted processing. */
    @Scheduled(
        fixedDelayString = "\${forena.telegram.retention-delay-ms:60000}",
        initialDelayString = "\${forena.telegram.retention-delay-ms:60000}",
    )
    @Transactional
    fun purgeExpired(): Int = repository.purgeExpired(clock.now().minus(7, ChronoUnit.DAYS))
}
