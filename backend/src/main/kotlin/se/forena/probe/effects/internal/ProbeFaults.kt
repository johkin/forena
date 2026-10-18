package se.forena.probe.effects.internal

import org.springframework.beans.factory.annotation.Value
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.support.TransactionSynchronization
import org.springframework.transaction.support.TransactionSynchronizationManager
import java.util.UUID

enum class FaultPoint { BEFORE_EFFECT, AFTER_EFFECT_COMMIT }

/** SQL-armed, one-shot faults for isolated BLOCK probes; never a public kill API. */
@Component
class ProbeFaults(
    private val claims: ProbeFaultClaims,
    @Value("\${probe.allow-crash:false}") private val enabled: Boolean
) {
    fun beforeEffect(id: UUID, instance: String) {
        if (enabled) crashIfArmed(id, instance, FaultPoint.BEFORE_EFFECT)
    }

    fun afterEffectCommit(id: UUID, instance: String) {
        if (!enabled) return
        check(TransactionSynchronizationManager.isActualTransactionActive())
        TransactionSynchronizationManager.registerSynchronization(object : TransactionSynchronization {
            override fun afterCommit() {
                // Runs after the effect is committed, before the transaction
                // interceptor returns to Modulith's outer completion advisor.
                crashIfArmed(id, instance, FaultPoint.AFTER_EFFECT_COMMIT)
            }
        })
    }

    private fun crashIfArmed(id: UUID, instance: String, point: FaultPoint) {
        if (!claims.claim(id, point, instance)) return
        System.err.println("probe_fault id=$id point=$point instance=$instance exit=137")
        System.err.flush()
        Runtime.getRuntime().halt(137)
    }
}

@Component
class ProbeFaultClaims(private val jdbc: JdbcClient) {
    // Also required from afterCommit: the old transaction's resources may still
    // be bound. The one-shot claim must commit independently before halt.
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    fun claim(id: UUID, point: FaultPoint, instance: String): Boolean = jdbc.sql("""
        update probe_fault set consumed_at=clock_timestamp(), consumed_by=:instance
        where id=:id and point=:point and consumed_at is null
    """.trimIndent()).param("id", id).param("point", point.name).param("instance", instance).update() == 1
}
