package se.forena.api.identity

import java.util.UUID
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.support.TransactionTemplate

data class Actor(val subject: UUID, val session: UUID)
class InactiveSession : RuntimeException()

@Service
class ActorTransactions(manager: PlatformTransactionManager, private val jdbc: JdbcTemplate) {
    private val transaction = TransactionTemplate(manager).also {
        it.propagationBehavior = TransactionDefinition.PROPAGATION_REQUIRES_NEW
    }

    fun <T : Any> asActor(actor: Actor, operation: () -> T): T = transaction.execute {
        jdbc.queryForObject("select set_config('forena.actor_id', ?, true)", String::class.java, actor.subject.toString())
        jdbc.queryForObject("select set_config('forena.session_id', ?, true)", String::class.java, actor.session.toString())
        val active = jdbc.queryForObject("""
            select exists(select 1 from forena.account where subject=?)
               and not exists(select 1 from forena.revoked_session where id=? and subject=?)
        """.trimIndent(), Boolean::class.java, actor.subject, actor.session, actor.subject) == true
        if (!active) throw InactiveSession()
        operation()
    }
}
