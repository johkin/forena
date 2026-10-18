package se.forena.probe

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.AfterEach
import org.awaitility.Awaitility.await
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.simple.JdbcClient
import se.forena.probe.commands.ProbeCommands
import se.forena.probe.commands.ProbeMode
import se.forena.probe.effects.internal.FaultPoint
import se.forena.probe.effects.internal.ProbeFaultClaims
import se.forena.probe.effects.internal.ProbeFaults
import java.sql.DriverManager
import java.util.UUID
import java.time.Duration
import java.util.concurrent.CompletableFuture

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
class FaultTest : DatabaseTest() {
    @Autowired lateinit var jdbc: JdbcClient
    @Autowired lateinit var commands: ProbeCommands
    @Autowired lateinit var claims: ProbeFaultClaims
    @Autowired lateinit var faults: ProbeFaults
    private val owned = mutableListOf<UUID>()

    private fun arm(point: FaultPoint): UUID {
        val id = UUID.randomUUID()
        owned.add(id)
        commands.submit(id, 0, ProbeMode.NORMAL)
        DriverManager.getConnection(database.jdbcUrl, database.username, database.password).use { connection ->
            connection.createStatement().use { it.executeUpdate("insert into forena_probe.probe_fault(id,point) values ('$id','${point.name}')") }
        }
        return id
    }

    @AfterEach
    fun cleanup() {
        for (id in owned) {
            await().atMost(Duration.ofSeconds(10)).untilAsserted {
                assertThat(jdbc.sql("select count(*) from event_publication where serialized_event like :id and completion_date is not null")
                    .param("id", "%$id%").query(Long::class.java).single()).isEqualTo(1)
            }
            DriverManager.getConnection(database.jdbcUrl, database.username, database.password).use { connection ->
                connection.createStatement().use { it.executeUpdate("delete from forena_probe.probe_fault where id='$id'") }
            }
            jdbc.sql("delete from event_publication where serialized_event like :id").param("id", "%$id%").update()
            for (table in listOf("probe_effect", "probe_release", "probe_receipt"))
                jdbc.sql("delete from $table where id=:id").param("id", id).update()
            jdbc.sql("delete from probe_attempt where run_id=:id").param("id", id).update()
            jdbc.sql("delete from probe_run where id=:id").param("id", id).update()
        }
    }

    @Test
    fun `runtime cannot arm delete or change a fault point`() {
        val id = arm(FaultPoint.BEFORE_EFFECT)
        for (sql in listOf(
            "insert into probe_fault(id,point) values ('$id','BEFORE_EFFECT')",
            "delete from probe_fault where id='$id'",
            "update probe_fault set point='AFTER_EFFECT_COMMIT' where id='$id'"
        )) assertThatThrownBy { jdbc.sql(sql).update() }
            .hasRootCauseMessage("ERROR: permission denied for table probe_fault")
    }

    @Test
    fun `wrong phase and unknown id cannot consume a fault`() {
        val id = arm(FaultPoint.AFTER_EFFECT_COMMIT)
        assertThat(claims.claim(id, FaultPoint.BEFORE_EFFECT, "test")).isFalse()
        assertThat(claims.claim(UUID.randomUUID(), FaultPoint.AFTER_EFFECT_COMMIT, "test")).isFalse()
        assertThat(jdbc.sql("select consumed_at is null from probe_fault where id=:id")
            .param("id", id).query(Boolean::class.java).single()).isTrue()
    }

    @Test
    fun `concurrent claims consume the fault exactly once`() {
        val id = arm(FaultPoint.BEFORE_EFFECT)
        val results = (1..8).map { index ->
            CompletableFuture.supplyAsync { claims.claim(id, FaultPoint.BEFORE_EFFECT, "test-$index") }
        }.map { it.get() }
        assertThat(results.count { it }).isEqualTo(1)
        assertThat(claims.claim(id, FaultPoint.BEFORE_EFFECT, "later")).isFalse()
    }

    @Test
    fun `fault injection is disabled by default even for an armed id`() {
        val id = arm(FaultPoint.BEFORE_EFFECT)
        faults.beforeEffect(id, "disabled")
        faults.afterEffectCommit(id, "disabled")
        assertThat(jdbc.sql("select consumed_at is null from probe_fault where id=:id")
            .param("id", id).query(Boolean::class.java).single()).isTrue()
    }
}
