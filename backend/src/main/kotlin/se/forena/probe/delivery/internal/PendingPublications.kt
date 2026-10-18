package se.forena.probe.delivery.internal

import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.beans.factory.annotation.Value
import javax.sql.DataSource
import java.sql.ResultSet
import org.springframework.stereotype.Repository
import java.time.Duration
import java.util.UUID

data class PendingProbe(val publicationId: UUID, val runId: UUID, val delayMs: Long)

/** Read-only projection of Modulith 2.1.0's registry; Modulith owns all state transitions. */
@Repository
class PendingPublications(dataSource: DataSource,
    @Value("\${probe.worker.read-timeout-seconds:2}") timeoutSeconds: Int
) {
    private val jdbc: JdbcClient
    init {
        require(timeoutSeconds in 1..10)
        jdbc = JdbcClient.create(JdbcTemplate(dataSource).apply { queryTimeout = timeoutSeconds })
    }

    fun <T : Any> exact(id: UUID, map: (ResultSet) -> T): List<T> = jdbc.sql("""
        select * from event_publication
        where id=:id and completion_date is null and status <> 'COMPLETED'
          and event_type = 'se.forena.probe.commands.ProbeRequested'
          and listener_id = 'se.forena.probe.effects.internal.ProbeListener.on(se.forena.probe.commands.ProbeRequested)'
    """).param("id", id).query { rs, _ -> map(rs) }.list()

    fun oldest(staleAfter: Duration, limit: Int): List<PendingProbe> = jdbc.sql("""
        select p.id publication_id, (p.serialized_event::jsonb ->> 'id')::uuid run_id,
               (p.serialized_event::jsonb ->> 'delayMs')::bigint delay_ms
        from event_publication p
        where p.completion_date is null
          and p.event_type = 'se.forena.probe.commands.ProbeRequested'
          and p.listener_id = 'se.forena.probe.effects.internal.ProbeListener.on(se.forena.probe.commands.ProbeRequested)'
          and p.serialized_event::jsonb ->> 'mode' <> 'CRASH'
          and greatest(p.publication_date, p.last_resubmission_date)
              < clock_timestamp() - (:age * interval '1 millisecond')
        order by p.publication_date, p.id
        limit :limit
    """.trimIndent()).param("age", staleAfter.toMillis()).param("limit", limit)
        .query { rs, _ -> PendingProbe(
            rs.getObject("publication_id", UUID::class.java),
            rs.getObject("run_id", UUID::class.java), rs.getLong("delay_ms")
        ) }.list()

    fun completed(id: UUID): Boolean = jdbc.sql("select completion_date is not null from event_publication where id=:id")
        .param("id", id).query(Boolean::class.java).optional().orElse(false)

}
