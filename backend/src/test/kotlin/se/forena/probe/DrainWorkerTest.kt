package se.forena.probe

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.awaitility.Awaitility.await
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.core.env.Environment
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.test.context.TestPropertySource
import se.forena.probe.commands.ProbeMode
import se.forena.probe.commands.ProbeRequested
import se.forena.probe.delivery.internal.PendingPublications
import se.forena.probe.delivery.internal.ProbePosition
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.sql.DriverManager
import java.sql.Timestamp
import java.time.Duration
import java.time.Instant
import java.util.UUID
import javax.sql.DataSource

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(properties = [
    "probe.worker.token=local-drain-worker-token-at-least-32-characters",
    "probe.worker.batch-size=2", "probe.worker.max-publications=4", "probe.worker.max-candidates=6",
    "probe.worker.budget=PT10S", "probe.worker.reserve=PT0.2S", "probe.worker.start-grace=PT1S"
])
class DrainWorkerTest : DatabaseTest() {
    @Autowired lateinit var jdbc: JdbcClient
    @Autowired lateinit var pending: PendingPublications
    @Autowired lateinit var environment: Environment
    @Autowired lateinit var json: JsonMapper
    @Autowired lateinit var dataSource: DataSource
    private val owned = mutableListOf<UUID>()
    private val client = HttpClient.newHttpClient()
    private val old = Instant.parse("2000-01-01T00:00:00Z")

    @AfterEach
    fun cleanup() {
        admin("alter table forena_probe.probe_effect drop constraint if exists m22f_reject_effect")
        if (owned.isNotEmpty()) {
            await().atMost(Duration.ofSeconds(10)).untilAsserted {
                assertThat(jdbc.sql("select count(*) from event_publication where (serialized_event::jsonb->>'id')::uuid in (:ids) and status in ('PROCESSING','RESUBMITTED')")
                    .param("ids", owned).query(Long::class.java).single()).isZero()
            }
            jdbc.sql("delete from event_publication where (serialized_event::jsonb->>'id')::uuid in (:ids)")
                .param("ids", owned).update()
            for (table in listOf("probe_effect", "probe_release", "probe_receipt"))
                jdbc.sql("delete from $table where id in (:ids)").param("ids", owned).update()
            jdbc.sql("delete from probe_attempt where run_id in (:ids)").param("ids", owned).update()
            jdbc.sql("delete from probe_run where id in (:ids)").param("ids", owned).update()
        }
        jdbc.sql("update probe_worker_cursor set publication_date=null,publication_id=null,revision=revision+1").update()
    }

    @Test
    fun `multiple small batches drain up to the invocation cap with stable keyset order`() {
        // Equal timestamps deliberately exercise the UUID tiebreaker over multiple pages/invocations.
        val ids = (1..8).map { seed(date = old) }.sortedBy(UUID::toString)
        val first = worker()
        assertThat(ids(first, "selected")).containsExactlyElementsOf(ids.take(4))
        assertThat(ids(first, "completed")).containsExactlyElementsOf(ids.take(4))
        assertThat(first.path("stopReason").asString()).isEqualTo("publication-limit")
        val second = worker()
        assertThat(ids(second, "completed")).containsExactlyElementsOf(ids.drop(4))
        assertThat(jdbc.sql("select count(*) from probe_effect where id in (:ids)").param("ids", ids)
            .query(Long::class.java).single()).isEqualTo(8)
        assertThat(jdbc.sql("select count(*) from probe_attempt where run_id in (:ids)").param("ids", ids)
            .query(Long::class.java).single()).isEqualTo(8)
        worker() // Wrap after reaching the end; no completed event is replayed.
        assertThat(ids(worker(), "selected")).isEmpty()
    }

    @Test
    fun `persistent cursor passes more deferred rows than the scan cap across invocations`() {
        val blocked = (1..8).map { seed(delay = 20000) }
        val eligible = (1..4).map { seed() }
        val first = worker()
        assertThat(first.path("examined").asInt()).isEqualTo(6)
        assertThat(first.path("stopReason").asString()).isEqualTo("scan-limit")
        assertThat(ids(first, "deferred")).containsExactlyElementsOf(blocked.take(6))
        assertThat(ids(first, "selected")).isEmpty()
        val second = worker()
        assertThat(ids(second, "completed")).containsExactlyElementsOf(eligible)
        assertThat(ids(second, "deferred")).containsExactlyElementsOf(blocked.drop(6))
        assertThat(jdbc.sql("select count(*) from probe_attempt where run_id in (:ids)")
            .param("ids", blocked).query(Long::class.java).single()).isZero()
    }

    @Test
    fun `fresh attempts at the front of the queue do not starve later eligible events`() {
        val fresh = (1..3).map { seed() }
        for (id in fresh) jdbc.sql("insert into probe_attempt(run_id,instance_id,started_at) values(:id,'fresh-fixture',clock_timestamp()+interval '1 day')")
            .param("id", id).update()
        val ready = (1..2).map { seed() }
        val result = worker()
        assertThat(ids(result, "deferred")).containsExactlyElementsOf(fresh)
        assertThat(ids(result, "completed")).containsExactlyElementsOf(ready)
    }

    @Test
    fun `failed listener is attempted once per cycle while later events still finish`() {
        val bad = seed()
        val ready = (1..2).map { seed() }
        admin("alter table forena_probe.probe_effect add constraint m22f_reject_effect check(id<>'$bad'::uuid)")
        val result = worker()
        assertThat(ids(result, "unfinished")).containsExactly(bad)
        assertThat(ids(result, "completed")).containsExactlyElementsOf(ready)
        assertThat(jdbc.sql("select count(*) from probe_attempt where run_id=:id").param("id", bad)
            .query(Long::class.java).single()).isEqualTo(1)
        // Next scheduled retry is only eligible once BOTH registry and attempt are stale.
        jdbc.sql("update event_publication set last_resubmission_date=:date where id=:id")
            .param("date", Timestamp.from(old)).param("id", bad).update()
        jdbc.sql("update probe_attempt set started_at=:date where run_id=:id")
            .param("date", Timestamp.from(old)).param("id", bad).update()
        assertThat(ids(worker(), "unfinished")).containsExactly(bad)
        assertThat(jdbc.sql("select count(*) from probe_attempt where run_id=:id").param("id", bad)
            .query(Long::class.java).single()).isEqualTo(2)
    }

    @Test
    fun `stalled listener yields the remaining request budget to other events`() {
        val stalled = seed()
        val ready = seed()
        dataSource.connection.use { blocker ->
            blocker.autoCommit = false
            blocker.prepareStatement("insert into probe_effect(id,instance_id) values(?, 'lock-fixture')").use {
                it.setObject(1, stalled); it.executeUpdate()
            }
            try {
                val result = worker()
                assertThat(ids(result, "unfinished")).containsExactly(stalled)
                assertThat(ids(result, "completed")).containsExactly(ready)
                assertThat(jdbc.sql("select count(*) from probe_attempt where run_id=:id").param("id", stalled)
                    .query(Long::class.java).single()).isEqualTo(1)
            } finally {
                blocker.rollback()
                await().atMost(Duration.ofSeconds(10)).untilAsserted {
                    assertThat(jdbc.sql("select completion_date is not null from event_publication where serialized_event like :id")
                        .param("id", "%$stalled%").query(Boolean::class.java).single()).isTrue()
                }
            }
        }
    }

    @Test
    fun `stale cursor checkpoint cannot overwrite another worker progress and runtime cannot delete it`() {
        val snapshot = pending.cursor()
        val position = ProbePosition(old, UUID.randomUUID())
        assertThat(pending.advance(snapshot.revision, position)).isTrue()
        assertThat(pending.advance(snapshot.revision, null)).isFalse()
        assertThat(pending.cursor().position).isEqualTo(position)
        for (sql in listOf("delete from probe_worker_cursor", "insert into probe_worker_cursor(singleton) values(false)",
            "update probe_worker_cursor set singleton=false"))
            assertThatThrownBy { jdbc.sql(sql).update() }.hasRootCauseMessage("ERROR: permission denied for table probe_worker_cursor")
    }

    private fun seed(delay: Long = 0, date: Instant = old.plusMillis(owned.size.toLong())): UUID {
        val id = UUID.randomUUID().also { owned.add(it) }
        val event = ProbeRequested(id, delay, ProbeMode.BLOCK, date)
        jdbc.sql("insert into probe_run(id,delay_ms,mode,requested_at) values(:id,:delay,'BLOCK',:date)")
            .param("id", id).param("delay", delay).param("date", Timestamp.from(date)).update()
        jdbc.sql("""
            insert into event_publication(id,listener_id,event_type,serialized_event,publication_date,status,completion_attempts)
            values(:id,'se.forena.probe.effects.internal.ProbeListener.on(se.forena.probe.commands.ProbeRequested)',
                'se.forena.probe.commands.ProbeRequested',:event,:date,'FAILED',1)
        """).param("id", id).param("event", json.writeValueAsString(event))
            .param("date", Timestamp.from(date)).update()
        return id
    }

    private fun admin(sql: String) = DriverManager.getConnection(database.jdbcUrl, database.username, database.password).use { connection ->
        connection.createStatement().use { it.execute(sql) }
    }

    private fun worker(): JsonNode {
        val uri = URI("http://127.0.0.1:${environment.getRequiredProperty("local.server.port")}/api/probes/worker")
        val response = client.send(HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(20))
            .header("Authorization", "Bearer local-drain-worker-token-at-least-32-characters")
            .POST(HttpRequest.BodyPublishers.ofString("{}")).build(), HttpResponse.BodyHandlers.ofString())
        assertThat(response.statusCode()).describedAs(response.body()).isEqualTo(200)
        return json.readTree(response.body()).also {
            assertThat(it.path("examined").asInt()).isLessThanOrEqualTo(6)
            assertThat(ids(it, "selected").size).isLessThanOrEqualTo(4)
        }
    }

    private fun ids(node: JsonNode, field: String) = node.path(field).toList().map { UUID.fromString(it.asString()) }
}
