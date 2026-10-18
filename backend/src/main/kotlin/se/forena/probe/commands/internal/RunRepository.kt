package se.forena.probe.commands.internal

import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import se.forena.probe.commands.ProbeMode
import se.forena.probe.commands.ProbeRequested
import java.time.OffsetDateTime
import java.util.UUID

@Repository
class RunRepository(private val jdbc: JdbcClient) {
    fun lock(id: UUID) {
        jdbc.sql("select pg_advisory_xact_lock(hashtextextended(:id, 0))").param("id", id.toString()).query { _, _ -> true }.single()
    }

    fun find(id: UUID): ProbeRequested? = jdbc.sql("select * from probe_run where id = :id")
        .param("id", id).query { rs, _ -> ProbeRequested(rs.getObject("id", UUID::class.java), rs.getLong("delay_ms"),
            ProbeMode.valueOf(rs.getString("mode")), rs.getObject("requested_at", OffsetDateTime::class.java).toInstant()) }
        .optional().orElse(null)

    fun insert(id: UUID, delayMs: Long, mode: ProbeMode): ProbeRequested {
        return jdbc.sql("insert into probe_run(id,delay_ms,mode) values (:id,:delay,:mode) returning requested_at")
            .param("id", id).param("delay", delayMs).param("mode", mode.name)
            .query { rs, _ -> ProbeRequested(id, delayMs, mode, rs.getObject(1, OffsetDateTime::class.java).toInstant()) }.single()
    }
}
