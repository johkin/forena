package se.forena.probe

import org.assertj.core.api.Assertions.assertThat
import org.awaitility.Awaitility.await
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.parallel.Execution
import org.junit.jupiter.api.parallel.ExecutionMode
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.core.env.Environment
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.test.context.TestPropertySource
import se.forena.probe.commands.ProbeCommands
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.sql.Timestamp
import java.time.Duration
import java.time.Instant
import java.util.UUID
import java.util.concurrent.TimeUnit
import javax.sql.DataSource

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(properties = [
    "probe.worker.token=local-worker-token-at-least-32-characters",
    "probe.worker.batch-size=2",
    "probe.worker.budget=PT3S",
    "probe.worker.stale-after=PT0.1S",
    "probe.worker.reserve=PT0.1S"
])
@Execution(ExecutionMode.SAME_THREAD)
class WorkerTest : DatabaseTest() {
    @Autowired lateinit var jdbc: JdbcClient
    @Autowired lateinit var environment: Environment
    @Autowired lateinit var commands: ProbeCommands
    @Autowired lateinit var json: JsonMapper
    @Autowired lateinit var dataSource: DataSource

    private val client = HttpClient.newHttpClient()
    private val owned = mutableListOf<UUID>()

    companion object {
        private const val WORKER_TOKEN = "local-worker-token-at-least-32-characters"
        private val OLD = Instant.parse("2000-01-01T00:00:00Z")
    }

    @AfterEach
    fun removeOnlyOwnedFixtures() {
        for (id in owned) {
            jdbc.sql("delete from event_publication where serialized_event like :id")
                .param("id", "%$id%").update()
            for (table in listOf("probe_receipt", "probe_effect", "probe_release")) {
                jdbc.sql("delete from $table where id=:id").param("id", id).update()
            }
            jdbc.sql("delete from probe_attempt where run_id=:id").param("id", id).update()
            jdbc.sql("delete from probe_run where id=:id").param("id", id).update()
        }
    }

    @Test
    fun `missing and incorrect worker bearer return 401 without starting work`() {
        val id = publication()
        val before = attempts(id)
        for (token in listOf(null, "incorrect-worker-token")) {
            assertThat(post("/api/probes/worker", token = token).statusCode()).isEqualTo(401)
        }
        assertUntouched(id, before)
    }

    @Test
    fun `ordinary and worker tokens cannot cross their endpoint boundary`() {
        val id = publication()
        val before = attempts(id)
        val deniedSubmission = UUID.randomUUID().also { owned.add(it) }
        assertThat(post("/api/probes/worker", token = TOKEN).statusCode()).isEqualTo(403)
        assertThat(post("/api/probes", payload(deniedSubmission), WORKER_TOKEN).statusCode()).isEqualTo(403)
        assertThat(post("/api/probes/$id/recover", token = WORKER_TOKEN).statusCode()).isEqualTo(403)
        val read = HttpRequest.newBuilder(uri("/api/probes/$id"))
            .header("Authorization", "Bearer $WORKER_TOKEN").GET().build()
        assertThat(client.send(read, HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(403)
        assertUntouched(id, before)
    }

    @ParameterizedTest
    @ValueSource(strings = ["FAILED", "PROCESSING"])
    fun `stale failed and abandoned processing are released and acknowledged before response`(status: String) {
        val id = publication(status = status, delayMs = 500)
        val before = attempts(id)
        val result = worker()

        assertThat(ids(result, "selected")).contains(id)
        assertThat(ids(result, "completed")).contains(id)
        assertThat(ids(result, "unfinished")).doesNotContain(id)
        assertThat(ids(result, "deferred")).doesNotContain(id)
        assertThat(count("probe_release", id)).isEqualTo(1)
        assertThat(attempts(id)).isEqualTo(before + 1)
        assertAcknowledged(id)
    }

    @Test
    fun `three stale publications are processed oldest first with at most two per invocation`() {
        // Create in the opposite order so insertion order cannot accidentally satisfy the test.
        val newest = publication(order = 30)
        val oldest = publication(order = 10)
        val middle = publication(order = 20)
        val newestAttempts = attempts(newest)

        val first = worker()
        assertThat(ids(first, "selected")).containsExactly(oldest, middle)
        assertThat(ids(first, "completed")).containsExactlyInAnyOrder(oldest, middle)
        assertAcknowledged(oldest)
        assertAcknowledged(middle)
        assertUntouched(newest, newestAttempts)

        val second = worker()
        assertThat(ids(second, "selected")).contains(newest).doesNotContain(oldest, middle)
        assertThat(ids(second, "completed")).contains(newest)
        assertAcknowledged(newest)
    }

    @ParameterizedTest
    @ValueSource(strings = ["publication_date", "last_resubmission_date", "started_at"])
    fun `processing freshness uses the latest publication resubmission or attempt`(column: String) {
        val id = publication(status = "PROCESSING")
        val before = attempts(id)
        // Ahead of now deliberately: a 100 ms stale window must not expire during the HTTP call.
        // The other timestamps stay old, exposing implementations that consult only one clock.
        val fresh = Timestamp.from(Instant.now().plusSeconds(60))
        if (column == "started_at") {
            jdbc.sql("update probe_attempt set started_at=:fresh where run_id=:id")
                .param("fresh", fresh).param("id", id).update()
        } else {
            jdbc.sql("update event_publication set $column=:fresh where serialized_event like :id")
                .param("fresh", fresh).param("id", "%$id%").update()
        }

        val result = worker()
        assertThat(ids(result, "selected")).doesNotContain(id)
        assertThat(ids(result, "completed")).doesNotContain(id)
        if (column == "started_at") {
            assertThat(ids(result, "deferred")).contains(id)
        }
        assertUntouched(id, before)
    }

    @Test
    fun `latest attempt protects processing even when an earlier attempt is stale`() {
        val id = publication(status = "PROCESSING")
        jdbc.sql("insert into probe_attempt(run_id, instance_id, started_at) values (:id, 'worker-test-fresh', :fresh)")
            .param("id", id).param("fresh", Timestamp.from(Instant.now().plusSeconds(60))).update()
        val before = attempts(id)
        val result = worker()
        assertThat(ids(result, "selected")).doesNotContain(id)
        assertThat(ids(result, "deferred")).contains(id)
        assertUntouched(id, before)
    }

    @Test
    fun `delay plus reserve above total budget is deferred without release or attempt`() {
        // 2950 ms alone fits PT3S; adding the configured 100 ms reserve does not.
        val id = publication(delayMs = 2950)
        val before = attempts(id)
        val result = worker()
        assertThat(ids(result, "deferred")).contains(id)
        assertThat(ids(result, "completed")).doesNotContain(id)
        assertUntouched(id, before)
    }

    @Test
    fun `remaining budget is checked again before starting the next publication`() {
        val first = publication(delayMs = 1800, order = 10)
        val second = publication(delayMs = 1800, order = 20)
        val before = attempts(second)
        val result = worker()
        assertThat(ids(result, "completed")).contains(first).doesNotContain(second)
        assertThat(ids(result, "deferred")).contains(second)
        assertAcknowledged(first)
        assertUntouched(second, before)
    }

    @Test
    fun `crash mode is never released or dispatched by worker`() {
        val crash = publication(mode = "CRASH", order = 10)
        val block = publication(order = 20)
        val before = attempts(crash)
        val result = worker()
        assertThat(ids(result, "selected")).doesNotContain(crash)
        assertThat(ids(result, "completed")).contains(block).doesNotContain(crash)
        assertUntouched(crash, before)
        assertAcknowledged(block)
    }

    @Test
    fun `worker filters completed publications and other listeners and event types`() {
        val completed = publication(order = 10)
        jdbc.sql("update event_publication set completion_date=clock_timestamp(), status='COMPLETED' where serialized_event like :id")
            .param("id", "%$completed%").update()
        val otherListener = publication(order = 20)
        jdbc.sql("update event_publication set listener_id='worker-test-other-listener' where serialized_event like :id")
            .param("id", "%$otherListener%").update()
        val otherType = publication(order = 30)
        // Use a real, deserializable type: predicate resubmission may read every incomplete row.
        jdbc.sql("update event_publication set event_type='java.util.LinkedHashMap' where serialized_event like :id")
            .param("id", "%$otherType%").update()
        val eligible = publication(order = 40)
        val before = listOf(completed, otherListener, otherType).associateWith(::attempts)

        val result = worker()
        assertThat(ids(result, "selected")).contains(eligible).doesNotContain(completed, otherListener, otherType)
        assertThat(ids(result, "completed")).contains(eligible)
        assertAcknowledged(eligible)
        before.forEach { (id, attemptCount) ->
            assertThat(attempts(id)).isEqualTo(attemptCount)
            assertThat(count("probe_release", id)).isZero()
            assertThat(count("probe_effect", id)).isZero()
        }
    }

    @Test
    fun `repeated worker call does not replay an acknowledged publication`() {
        val id = publication()
        assertThat(ids(worker(), "completed")).contains(id)
        assertAcknowledged(id)
        val before = attempts(id)
        val second = worker()
        for (field in listOf("selected", "completed", "unfinished", "deferred")) {
            assertThat(ids(second, field)).doesNotContain(id)
        }
        assertThat(attempts(id)).isEqualTo(before)
        assertThat(count("probe_release", id)).isEqualTo(1)
        assertAcknowledged(id)
    }

    @Test
    fun `HTTP remains active while the listener works and returns after registry acknowledgement`() {
        val id = publication(delayMs = 1000)
        val before = attempts(id)
        val pending = client.sendAsync(postRequest("/api/probes/worker", "{}", WORKER_TOKEN), HttpResponse.BodyHandlers.ofString())
        try {
            await().atMost(Duration.ofSeconds(5)).untilAsserted {
                assertThat(attempts(id)).isEqualTo(before + 1)
            }
            assertThat(pending.isDone).isFalse()
        } finally {
            // Join even on assertion failure so cleanup cannot race the asynchronous listener.
            val response = pending.get(10, TimeUnit.SECONDS)
            assertThat(response.statusCode()).isEqualTo(200)
        }
        assertAcknowledged(id)
        assertThat(attempts(id)).isEqualTo(before + 1)
    }

    @Test
    fun `concurrent call defers a fresh attempt and deadline leaves its publication unfinished`() {
        val id = publication()
        val before = attempts(id)
        dataSource.connection.use { blocker ->
            blocker.autoCommit = false
            // An uncommitted unique key blocks the listener's INSERT, without changing its declared
            // delay or relying on a slow machine. The worker must stop waiting at its own deadline.
            blocker.prepareStatement("insert into probe_effect(id,instance_id) values (?, 'worker-test-lock')").use {
                it.setObject(1, id)
                it.executeUpdate()
            }
            val started = System.nanoTime()
            val pending = client.sendAsync(postRequest("/api/probes/worker", "{}", WORKER_TOKEN), HttpResponse.BodyHandlers.ofString())
            try {
                await().atMost(Duration.ofSeconds(5)).untilAsserted {
                    assertThat(attempts(id)).isEqualTo(before + 1)
                }
                // Keep registry timestamps old so the overlapping request reaches the effects API
                // freshness guard. A future attempt avoids racing the tiny 100 ms stale window.
                jdbc.sql("update event_publication set last_resubmission_date=:old where serialized_event like :id")
                    .param("old", Timestamp.from(OLD)).param("id", "%$id%").update()
                jdbc.sql("update probe_attempt set started_at=:fresh where run_id=:id")
                    .param("fresh", Timestamp.from(Instant.now().plusSeconds(60))).param("id", id).update()
                assertThat(pending.isDone).isFalse()
                val overlapping = worker()
                assertThat(ids(overlapping, "deferred")).contains(id)
                assertThat(ids(overlapping, "selected")).doesNotContain(id)
                assertThat(ids(overlapping, "completed")).doesNotContain(id)

                val result = workerResult(pending.get(10, TimeUnit.SECONDS))
                assertThat(Duration.ofNanos(System.nanoTime() - started)).isLessThan(Duration.ofSeconds(7))
                assertThat(ids(result, "selected")).contains(id)
                assertThat(ids(result, "unfinished")).contains(id)
                assertThat(ids(result, "completed")).doesNotContain(id)
                assertThat(attempts(id)).isEqualTo(before + 1)
                assertThat(count("probe_release", id)).isEqualTo(1)
                assertThat(count("probe_effect", id)).isZero()
                assertThat(jdbc.sql("select count(*) from event_publication where serialized_event like :id and completion_date is null")
                    .param("id", "%$id%").query(Long::class.java).single()).isEqualTo(1)
            } finally {
                blocker.rollback()
                // Let the real listener finish before removing its parent run in @AfterEach.
                await().atMost(Duration.ofSeconds(10)).untilAsserted { assertAcknowledged(id) }
                pending.get(10, TimeUnit.SECONDS)
            }
        }
    }

    private fun publication(
        status: String = "FAILED",
        delayMs: Long = 0,
        mode: String = "BLOCK",
        order: Long = 0
    ): UUID {
        val id = UUID.randomUUID().also { owned.add(it) }
        assertThat(post("/api/probes", payload(id), TOKEN).statusCode()).isEqualTo(202)
        await().atMost(Duration.ofSeconds(10)).untilAsserted {
            assertThat(jdbc.sql("select count(*) from event_publication where serialized_event like :id and status='FAILED'")
                .param("id", "%$id%").query(Long::class.java).single()).isEqualTo(1)
        }
        // Start with real serialization/listener identity, then model an abandoned delivery without
        // leaving a sleeping listener behind. CRASH is never submitted to a live listener here.
        jdbc.sql("update probe_run set delay_ms=:delay, mode=:mode where id=:id")
            .param("delay", delayMs).param("mode", mode).param("id", id).update()
        val event = requireNotNull(commands.find(id))
        val old = Timestamp.from(OLD.plusSeconds(order))
        jdbc.sql("""
            update event_publication set serialized_event=:event, status=:status,
                publication_date=:old, last_resubmission_date=:old, completion_date=null
            where serialized_event like :id
        """)
            .param("event", json.writeValueAsString(event)).param("status", status)
            .param("old", old).param("id", "%$id%").update()
        jdbc.sql("update probe_attempt set started_at=:old where run_id=:id")
            .param("old", old).param("id", id).update()
        return id
    }

    private fun worker(): JsonNode = workerResult(post("/api/probes/worker"))

    private fun workerResult(response: HttpResponse<String>): JsonNode {
        assertThat(response.statusCode()).describedAs(response.body()).isEqualTo(200)
        assertThat(response.headers().firstValue("Content-Type").orElse("")).startsWith("application/json")
        val result = json.readTree(response.body())
        for (field in listOf("selected", "completed", "unfinished", "deferred")) {
            assertThat(result.path(field).isArray).describedAs(field).isTrue()
            assertThat(ids(result, field)).doesNotHaveDuplicates()
        }
        assertThat(ids(result, "selected").size).isLessThanOrEqualTo(2)
        assertThat(result.path("stopReason").isString).isTrue()
        assertThat(result.path("stopReason").asString()).isNotBlank()
        return result
    }

    private fun ids(result: JsonNode, field: String): List<UUID> =
        result.path(field).toList().map { UUID.fromString(it.asString()) }

    private fun assertAcknowledged(id: UUID) {
        // No polling after the worker response: both the effect and registry ack must already exist.
        assertThat(count("probe_effect", id)).isEqualTo(1)
        assertThat(jdbc.sql("select count(*) from event_publication where serialized_event like :id and completion_date is not null")
            .param("id", "%$id%").query(Long::class.java).single()).isEqualTo(1)
    }

    private fun assertUntouched(id: UUID, attemptCount: Long) {
        assertThat(attempts(id)).isEqualTo(attemptCount)
        assertThat(count("probe_release", id)).isZero()
        assertThat(count("probe_effect", id)).isZero()
        assertThat(jdbc.sql("select count(*) from event_publication where serialized_event like :id and completion_date is null")
            .param("id", "%$id%").query(Long::class.java).single()).isEqualTo(1)
    }

    private fun count(table: String, id: UUID): Long = jdbc.sql("select count(*) from $table where id=:id")
        .param("id", id).query(Long::class.java).single()

    private fun attempts(id: UUID): Long = jdbc.sql("select count(*) from probe_attempt where run_id=:id")
        .param("id", id).query(Long::class.java).single()

    private fun payload(id: UUID) = """{"id":"$id","delayMs":0,"mode":"BLOCK"}"""

    private fun uri(path: String) = URI("http://127.0.0.1:${environment.getRequiredProperty("local.server.port")}$path")

    private fun postRequest(path: String, body: String, token: String?): HttpRequest {
        val builder = HttpRequest.newBuilder(uri(path)).timeout(Duration.ofSeconds(15))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(body))
        token?.let { builder.header("Authorization", "Bearer $it") }
        return builder.build()
    }

    private fun post(path: String, body: String = "{}", token: String? = WORKER_TOKEN): HttpResponse<String> =
        client.send(postRequest(path, body, token), HttpResponse.BodyHandlers.ofString())
}
