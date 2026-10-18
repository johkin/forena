package se.forena.probe.transport

import org.springframework.beans.factory.annotation.Value
import org.springframework.http.ResponseEntity
import org.springframework.modulith.events.IncompleteEventPublications
import org.springframework.web.bind.annotation.*
import org.springframework.web.server.ResponseStatusException
import org.springframework.http.HttpStatus
import se.forena.probe.commands.ProbeCommands
import se.forena.probe.commands.ProbeMode
import se.forena.probe.commands.ProbeReceipt
import se.forena.probe.commands.ProbeRequested
import se.forena.probe.effects.EffectControl
import java.time.Duration
import java.util.UUID

@RestController
@RequestMapping("/api/probes")
class ProbeController(
    private val commands: ProbeCommands,
    private val effects: EffectControl,
    private val publications: IncompleteEventPublications,
    @Value("\${probe.allow-crash:false}") private val allowCrash: Boolean
) {
    data class Submission(val id: UUID, val delayMs: Long = 10_000, val mode: ProbeMode = ProbeMode.NORMAL)

    @PostMapping
    fun submit(@RequestBody body: Submission): ResponseEntity<ProbeReceipt> {
        if (body.mode == ProbeMode.CRASH && !allowCrash) throw ResponseStatusException(HttpStatus.FORBIDDEN)
        return ResponseEntity.accepted().body(commands.submit(body.id, body.delayMs, body.mode))
    }

    @GetMapping("/{id}")
    fun status(@PathVariable id: UUID): Map<String, Any?> {
        val event = commands.find(id) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        return mapOf("id" to event.id, "requestedAt" to event.requestedAt, "mode" to event.mode) + effects.status(id)
    }

    @PostMapping("/{id}/recover")
    fun recover(@PathVariable id: UUID): Map<String, Any?> {
        commands.find(id) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)
        effects.release(id)
        publications.resubmitIncompletePublications { (it.event as? ProbeRequested)?.id == id }
        // Keep this recovery invocation alive until completion; an async re-dispatch alone is insufficient.
        val deadline = System.nanoTime() + Duration.ofSeconds(100).toNanos()
        while (effects.status(id)["completedAt"] == null && System.nanoTime() < deadline) Thread.sleep(100)
        if (effects.status(id)["completedAt"] == null) throw ResponseStatusException(HttpStatus.GATEWAY_TIMEOUT)
        return status(id)
    }

    @ExceptionHandler(IllegalArgumentException::class)
    fun invalid(): ResponseEntity<Map<String, String>> = ResponseEntity.badRequest().body(mapOf("error" to "Invalid probe request or conflicting idempotency key"))
}
