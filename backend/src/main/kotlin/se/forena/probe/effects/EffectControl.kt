package se.forena.probe.effects

import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID
import java.time.Duration

data class EffectStatus(val completedAt: String?, val completedBy: String?, val attempts: Long)

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
    fun status(id: UUID): EffectStatus {
        val completed = jdbc.sql("select completed_at, instance_id from probe_effect where id=:id")
            .param("id", id).query { rs, _ -> Pair(rs.getObject("completed_at")?.toString(), rs.getString("instance_id")) }.optional().orElse(null)
        val attempts = jdbc.sql("select count(*) from probe_attempt where run_id=:id").param("id", id).query(Long::class.java).single()
        return EffectStatus(completed?.first, completed?.second, attempts)
    }
}
