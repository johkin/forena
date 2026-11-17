package se.forena.api.identity

import java.time.Duration
import java.time.Instant
import java.util.UUID
import org.slf4j.LoggerFactory
import org.springframework.dao.DataAccessException
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.security.access.AccessDeniedException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.support.TransactionTemplate
import se.forena.api.identity.authentication.AuthMailService
import se.forena.api.identity.internal.AccountLifecycleRepository
import se.forena.api.identity.internal.UserRepository

@Service
class AccountLifecycleService(
    private val repository: AccountLifecycleRepository, private val users: UserRepository,
    private val clock: DatabaseClockService, private val mail: AuthMailService,
    private val settings: BrowserSessionSettings, private val transaction: TransactionTemplate,
) {
    private val logger = LoggerFactory.getLogger(AccountLifecycleService::class.java)

    @Transactional
    internal fun refresh(subject: UUID): AccountLifecycleStatus {
        repository.ensure(subject)
        val row = repository.lock(subject)
        val now = clock.now()
        repository.checked(subject, now)
        val connections = repository.connections(subject)
        if (repository.platform(subject) || connections.isNotEmpty()) {
            repository.connected(subject, now, connections.maxOfOrNull { it.until } ?: Instant.parse("9999-12-31T00:00:00Z"))
            return AccountLifecycleStatus(true, null)
        }
        if (row.activatedAt == null) return AccountLifecycleStatus(false, null)
        val disconnected = row.disconnectedAt ?: minOf(now, row.connectionUntil ?: now)
        val deadline = disconnected.plus(Duration.ofDays(30))
        if (row.disconnectedAt == null) {
            repository.disconnect(subject, disconnected)
            notify(subject, "account-warning", deadline)
        }
        if (!row.reminderSent && now >= deadline.minus(Duration.ofDays(7)) && now < deadline) {
            notify(subject, "account-reminder", deadline)
            repository.reminded(subject)
        }
        if (now >= deadline) repository.erase(subject, now)
        return AccountLifecycleStatus(true, deadline)
    }
    @Transactional
    fun connectionsChanged(subject: UUID) { refresh(subject) }
    fun clubs(subject: UUID): List<AccountClub> = repository.connections(subject).map { AccountClub(it.id, it.name) }
    fun hasBusinessAccess(subject: UUID): Boolean = repository.platform(subject) || repository.connections(subject).isNotEmpty()
    fun requireBusinessAccess(subject: UUID) {
        if (!hasBusinessAccess(subject))
            throw AccessDeniedException("Approved club connection required")
    }
    private fun notify(subject: UUID, kind: String, deadline: Instant) {
        val user = users.findById(subject) ?: return
        mail.enqueue(user.email, kind, "${settings.origin}/account#deletion=$deadline", deadline)
    }
    fun runMaintenance() {
        sweep()
        mail.deliver()
    }

    @Scheduled(fixedDelayString = "\${forena.account.lifecycle-delay-ms:60000}")
    fun sweep() {
        repository.subjects().forEach { subject ->
            try { transaction.executeWithoutResult { refresh(subject) } }
            catch (_: DataAccessException) { logger.warn("account_lifecycle_retry") }
        }
    }
}
