package se.forena.api.identity

import java.util.UUID
import java.time.Instant
import org.springframework.stereotype.Service
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.support.TransactionTemplate
import se.forena.api.identity.internal.AccountRepository
import se.forena.api.identity.internal.RevokedSessionRepository
import se.forena.api.identity.internal.DatabaseClockRepository
import se.forena.api.identity.internal.AuditContextRepository
import org.springframework.transaction.support.TransactionSynchronizationManager

data class Actor(val subject: UUID, val session: UUID)
class InactiveSession : RuntimeException()

@Service
class ActorTransactions(manager: PlatformTransactionManager, private val clock: DatabaseClockRepository,
                        private val accounts: AccountRepository, private val revocations: RevokedSessionRepository,
                        private val audit: AuditContextRepository) {
    private val transaction = TransactionTemplate(manager).also {
        it.propagationBehavior = TransactionDefinition.PROPAGATION_REQUIRES_NEW
    }

    fun <T : Any> asActor(actor: Actor, operation: () -> T): T = transaction.execute {
        val active = accounts.existsBySubjectAndEnabledTrue(actor.subject) &&
            !revocations.existsByIdAndSubject(actor.session, actor.subject)
        if (!active) throw InactiveSession()
        operation()
    }

    fun bindAuditActor(actor: Actor) {
        check(TransactionSynchronizationManager.isActualTransactionActive())
        check(audit.bindAuditActor(actor.subject.toString(), actor.session.toString()))
    }

    fun databaseTime(): Instant {
        check(TransactionSynchronizationManager.isActualTransactionActive())
        return clock.databaseTime()
    }
}
