package se.forena.probe.delivery.internal

import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.beans.factory.annotation.Value
import javax.sql.DataSource
import java.sql.ResultSet
import org.springframework.stereotype.Repository
import java.time.Duration
import java.time.Instant
import java.sql.Timestamp
import java.util.UUID

data class ProbePosition(val date: Instant, val id: UUID)
data class WorkerCursor(val revision: Long, val position: ProbePosition?)
data class PublicationState(val completed: Boolean, val failed: Boolean)
data class PendingProbe(val publicationId: UUID, val runId: UUID, val delayMs: Long, val publishedAt: Instant) {
    val position: ProbePosition get() = ProbePosition(publishedAt, publicationId)
}

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

    fun oldest(staleAfter: Duration, limit: Int, after: ProbePosition? = null): List<PendingProbe> = jdbc.sql("""
        select p.publication_date, p.id publication_id, (p.serialized_event::jsonb ->> 'id')::uuid run_id,
               (p.serialized_event::jsonb ->> 'delayMs')::bigint delay_ms
        from event_publication p
        where p.completion_date is null
          and p.event_type = 'se.forena.probe.commands.ProbeRequested'
          and p.listener_id = 'se.forena.probe.effects.internal.ProbeListener.on(se.forena.probe.commands.ProbeRequested)'
          and p.serialized_event::jsonb ->> 'mode' <> 'CRASH'
          and greatest(p.publication_date, p.last_resubmission_date)
              < clock_timestamp() - (:age * interval '1 millisecond')
          and (cast(:after_id as uuid) is null or (p.publication_date, p.id) >
              (cast(:after_date as timestamptz), cast(:after_id as uuid)))
        order by p.publication_date, p.id
        limit :limit
    """.trimIndent()).param("age", staleAfter.toMillis()).param("limit", limit)
        .param("after_id", after?.id).param("after_date", after?.date?.let(Timestamp::from))
        .query { rs, _ -> PendingProbe(
            rs.getObject("publication_id", UUID::class.java),
            rs.getObject("run_id", UUID::class.java), rs.getLong("delay_ms"), rs.getTimestamp("publication_date").toInstant()
        ) }.list()

    fun state(id: UUID): PublicationState = jdbc.sql("select completion_date, status from event_publication where id=:id")
        .param("id", id).query { rs, _ -> PublicationState(rs.getTimestamp("completion_date") != null,
            rs.getString("status") == "FAILED") }.optional().orElse(PublicationState(false, false))

    fun cursor(): WorkerCursor = jdbc.sql("select revision, publication_date, publication_id from probe_worker_cursor where singleton")
        .query { rs, _ -> WorkerCursor(rs.getLong("revision"), rs.getTimestamp("publication_date")?.let {
            ProbePosition(it.toInstant(), rs.getObject("publication_id", UUID::class.java))
        }) }.single()

    /** Scheduling read progress only. No registry delivery state is changed. Autocommit before dispatch. */
    fun advance(expectedRevision: Long, position: ProbePosition?): Boolean = jdbc.sql("""
        update probe_worker_cursor set publication_date=:date, publication_id=:id, revision=revision+1
        where singleton and revision=:revision
    """).param("date", position?.date?.let(Timestamp::from)).param("id", position?.id)
        .param("revision", expectedRevision).update() == 1

}
