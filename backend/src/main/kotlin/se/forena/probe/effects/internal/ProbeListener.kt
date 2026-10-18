package se.forena.probe.effects.internal

import org.springframework.beans.factory.annotation.Value
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.modulith.events.ApplicationModuleListener
import org.springframework.stereotype.Component
import se.forena.probe.commands.ProbeMode
import se.forena.probe.commands.ProbeRequested
import java.util.UUID

@Component
class ProbeListener(
    private val jdbc: JdbcClient,
    private val attempts: ProbeAttempts,
    @Value("\${probe.allow-crash:false}") private val allowCrash: Boolean
) {
    private val instanceId = UUID.randomUUID().toString()

    @ApplicationModuleListener
    fun on(event: ProbeRequested) {
        attempts.record(event.id, instanceId)
        // Deliberate bounded delay: this is a lifecycle experiment, not production scheduling.
        Thread.sleep(event.delayMs)
        val released = jdbc.sql("select exists(select 1 from probe_release where id=:id)")
            .param("id", event.id).query(Boolean::class.java).single()
        if (!released && event.mode == ProbeMode.BLOCK) error("Deliberately blocked probe")
        if (!released && event.mode == ProbeMode.CRASH) {
            check(allowCrash) { "Crash mode is disabled" }
            Runtime.getRuntime().halt(137)
        }
        jdbc.sql("insert into probe_effect(id,instance_id) values (:id,:instance) on conflict do nothing")
            .param("id", event.id).param("instance", instanceId).update()
    }
}
