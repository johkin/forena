package se.forena.api.identity

import java.time.Instant
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionSynchronizationManager
import se.forena.api.identity.internal.DatabaseClockRepository

@Service
class DatabaseClock(private val clock: DatabaseClockRepository) {
    fun now(): Instant {
        check(TransactionSynchronizationManager.isActualTransactionActive())
        return clock.databaseTime()
    }
}
