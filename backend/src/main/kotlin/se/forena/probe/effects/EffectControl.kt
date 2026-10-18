package se.forena.probe.effects

import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID
import java.time.Duration

@Service
class EffectControl(private val jdbc: JdbcClient) {
    @Transactional(readOnly = true)
    fun hasRecentAttempt(id: UUID, age: Duration): Boolean =
        jdbc.sql("select exists(select 1 from probe_attempt where run_id=:id and started_at >= clock_timestamp() - (:age * interval '1 millisecond'))")
            .param("id", id).param("age", age.toMillis()).query(Boolean::class.java).single()

    @Transactional
    fun release(id: UUID) {
        jdbc.sql("insert into probe_release(id) values (:id) on conflict do nothing").param("id", id).update()
    }

    @Transactional(readOnly = true)
    fun status(id: UUID): Map<String, Any?> {
        val completed = jdbc.sql("select completed_at, instance_id from probe_effect where id=:id")
            .param("id", id).query { rs, _ -> mapOf<String, Any?>("completed_at" to rs.getObject("completed_at"), "instance_id" to rs.getString("instance_id")) }.optional().orElse(emptyMap())
        val attempts = jdbc.sql("select count(*) from probe_attempt where run_id=:id").param("id", id).query(Long::class.java).single()
        return mapOf("completedAt" to completed["completed_at"]?.toString(), "completedBy" to completed["instance_id"], "attempts" to attempts)
    }
}
