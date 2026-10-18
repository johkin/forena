package se.forena.probe

import org.assertj.core.api.Assertions.assertThat
import org.awaitility.Awaitility.await
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.core.env.Environment
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.transaction.support.TransactionTemplate
import se.forena.probe.commands.ProbeCommands
import se.forena.probe.commands.ProbeMode
import tools.jackson.databind.json.JsonMapper
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.util.UUID
import java.util.concurrent.CompletableFuture

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class LifecycleTest : DatabaseTest() {
    @Autowired lateinit var jdbc: JdbcClient
    @Autowired lateinit var environment: Environment
    @Autowired lateinit var commands: ProbeCommands
    @Autowired lateinit var transaction: TransactionTemplate
    @Autowired lateinit var json: JsonMapper

    private fun request(path: String, body: String? = null, token: String? = TOKEN): HttpResponse<String> {
        val builder = HttpRequest.newBuilder(URI("http://127.0.0.1:${environment.getRequiredProperty("local.server.port")}$path"))
        token?.let { builder.header("Authorization", "Bearer $it") }
        if (body == null) builder.GET() else builder.header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(body))
        return HttpClient.newHttpClient().send(builder.build(), HttpResponse.BodyHandlers.ofString())
    }
    private fun count(table: String, id: UUID): Long = jdbc.sql("select count(*) from $table where id=:id").param("id", id).query(Long::class.java).single()
    private fun payload(id: UUID, delay: Int = 0, mode: String = "NORMAL") = """{"id":"$id","delayMs":$delay,"mode":"$mode"}"""

    @Test
    fun `a delayed listener commits after the full HTTP response without another HTTP request`() {
        val id = UUID.randomUUID()
        val response = request("/api/probes", payload(id, 1500))
        assertThat(response.statusCode()).isEqualTo(202)
        assertThat(count("probe_effect", id)).isZero()
        jdbc.sql("insert into probe_receipt(id) values (:id)").param("id", id).update()
        await().atMost(Duration.ofSeconds(10)).untilAsserted { assertThat(count("probe_effect", id)).isEqualTo(1) }
        assertThat(jdbc.sql("select e.completed_at > r.received_at from probe_effect e join probe_receipt r using(id) where id=:id")
            .param("id", id).query(Boolean::class.java).single()).isTrue()
        await().atMost(Duration.ofSeconds(5)).untilAsserted {
            assertThat(jdbc.sql("select count(*) from event_publication where serialized_event like :id and completion_date is not null")
                .param("id", "%$id%").query(Long::class.java).single()).isEqualTo(1)
        }
    }

    @Test
    fun `failed publication is durable and recovery completes before returning`() {
        val id = UUID.randomUUID()
        assertThat(request("/api/probes", payload(id, mode = "BLOCK")).statusCode()).isEqualTo(202)
        await().atMost(Duration.ofSeconds(10)).untilAsserted {
            assertThat(jdbc.sql("select count(*) from event_publication where serialized_event like :id and status='FAILED'")
                .param("id", "%$id%").query(Long::class.java).single()).isEqualTo(1)
        }
        assertThat(count("probe_effect", id)).isZero()
        assertThat(request("/api/probes/$id/recover", "{}").statusCode()).isEqualTo(200)
        assertThat(count("probe_effect", id)).isEqualTo(1)
        assertThat(request("/api/probes/$id/recover", "{}").statusCode()).isEqualTo(200)
        assertThat(count("probe_effect", id)).isEqualTo(1)
    }

    @Test
    fun `rollback removes both business write and persistent publication`() {
        val id = UUID.randomUUID()
        transaction.executeWithoutResult { status -> commands.submit(id, 0, ProbeMode.NORMAL); status.setRollbackOnly() }
        assertThat(count("probe_run", id)).isZero()
        assertThat(jdbc.sql("select count(*) from event_publication where serialized_event like :id").param("id", "%$id%").query(Long::class.java).single()).isZero()
        assertThat(count("probe_effect", id)).isZero()
    }

    @Test
    fun `concurrent retry publishes once and rejects a different payload`() {
        val id = UUID.randomUUID()
        val submissions = (1..5).map { CompletableFuture.supplyAsync { request("/api/probes", payload(id)) } }
        assertThat(submissions.map { it.get().statusCode() }).containsOnly(202)
        await().atMost(Duration.ofSeconds(10)).untilAsserted { assertThat(count("probe_effect", id)).isEqualTo(1) }
        assertThat(jdbc.sql("select count(*) from event_publication where serialized_event like :id").param("id", "%$id%").query(Long::class.java).single()).isEqualTo(1)
        assertThat(request("/api/probes", payload(id, 1)).statusCode()).isEqualTo(400)
    }

    @Test
    fun `missing and incorrect bearer are denied and crash is off by default`() {
        assertThat(request("/api/probes", payload(UUID.randomUUID()), null).statusCode()).isEqualTo(401)
        assertThat(request("/api/probes", payload(UUID.randomUUID()), "wrong").statusCode()).isEqualTo(401)
        assertThat(request("/api/probes", payload(UUID.randomUUID(), mode = "CRASH")).statusCode()).isEqualTo(403)
        assertThat(request("/api/probes", payload(UUID.randomUUID(), -1)).statusCode()).isEqualTo(400)
    }

    @Test
    fun `runtime role cannot bypass RLS or create tables`() {
        assertThat(jdbc.sql("select rolsuper or rolbypassrls from pg_roles where rolname=current_user").query(Boolean::class.java).single()).isFalse()
        assertThat(jdbc.sql("select has_schema_privilege(current_user,'forena_probe','CREATE')").query(Boolean::class.java).single()).isFalse()
    }

    @Test
    fun `static frontend and health are served by the JVM`() {
        assertThat(request("/", token = null).body()).contains("Isolerat Kotlin-teknikprov")
        assertThat(request("/actuator/health", token = null).statusCode()).isEqualTo(200)
    }
}
