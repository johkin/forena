package se.forena.probe.commands

import org.springframework.context.ApplicationEventPublisher
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import se.forena.probe.commands.internal.RunRepository
import java.util.UUID

@Service
class ProbeCommands(private val runs: RunRepository, private val events: ApplicationEventPublisher) {
    @Transactional
    fun submit(id: UUID, delayMs: Long, mode: ProbeMode): ProbeReceipt {
        require(delayMs in 0..90_000) { "delayMs must be between 0 and 90000" }
        runs.lock(id)
        val existing = runs.find(id)
        if (existing != null) {
            require(existing.delayMs == delayMs && existing.mode == mode) { "Idempotency key has a different payload" }
            return ProbeReceipt(existing.id, existing.requestedAt)
        }
        val event = runs.insert(id, delayMs, mode)
        events.publishEvent(event)
        return ProbeReceipt(event.id, event.requestedAt)
    }

    @Transactional(readOnly = true)
    fun find(id: UUID): ProbeRequested? = runs.find(id)
}
