package se.forena.probe.delivery

import org.springframework.beans.factory.annotation.Value
import se.forena.probe.delivery.internal.BoundedResubmission
import org.springframework.stereotype.Service
import org.slf4j.LoggerFactory
import se.forena.probe.delivery.internal.PendingPublications
import se.forena.probe.effects.EffectControl
import java.time.Duration
import java.util.UUID

data class WorkerResult(
    val selected: List<UUID>,
    val completed: List<UUID>,
    val unfinished: List<UUID>,
    val deferred: List<UUID>,
    val stopReason: String
)

/** Request-bound recovery for synthetic probes; no JVM timer is a delivery guarantee. */
@Service
class ProbeWorker(
    private val pending: PendingPublications,
    private val effects: EffectControl,
    private val publications: BoundedResubmission,
    @Value("\${probe.worker.batch-size:2}") private val batchSize: Int,
    @Value("\${probe.worker.budget:PT120S}") private val budget: Duration,
    @Value("\${probe.worker.stale-after:PT120S}") private val staleAfter: Duration,
    @Value("\${probe.worker.reserve:PT5S}") private val reserve: Duration
) {
    private val log = LoggerFactory.getLogger(ProbeWorker::class.java)
    init {
        require(batchSize in 1..10)
        require(!budget.isNegative && !budget.isZero && budget <= Duration.ofSeconds(180))
        require(!staleAfter.isNegative)
        require(!reserve.isNegative && reserve < budget)
    }

    fun run(): WorkerResult {
        val deadline = System.nanoTime() + budget.toNanos()
        val candidates = pending.oldest(staleAfter, batchSize)
        val selected = mutableListOf<UUID>()
        val completed = mutableListOf<UUID>()
        val unfinished = mutableListOf<UUID>()
        val deferred = mutableListOf<UUID>()
        var reason = if (candidates.size == batchSize) "batch-limit" else "drained"
        for (candidate in candidates) {
            if (effects.hasRecentAttempt(candidate.runId, staleAfter)) {
                deferred.add(candidate.runId)
                reason = "in-progress"
                continue
            }
            if (Thread.currentThread().isInterrupted) {
                reason = "interrupted"
                break
            }
            if (System.nanoTime() + Duration.ofMillis(candidate.delayMs).toNanos() + reserve.toNanos() >= deadline) {
                deferred.add(candidate.runId)
                reason = "budget"
                continue
            }
            // Commit release separately before asynchronous listener execution.
            // No transaction spans this request, its waits, or the listener.
            effects.release(candidate.runId)
            selected.add(candidate.runId)
            publications.resubmit(candidate.publicationId, deadline)
            while (System.nanoTime() < deadline) {
                if (pending.completed(candidate.publicationId)) break
                try {
                    Thread.sleep(100)
                } catch (_: InterruptedException) {
                    Thread.currentThread().interrupt()
                    break
                }
            }
            if (pending.completed(candidate.publicationId)) {
                completed.add(candidate.runId)
            } else {
                unfinished.add(candidate.runId)
                reason = if (System.nanoTime() >= deadline) "budget" else "unfinished"
                // Leave durable work for a later invocation, never hot-loop retries.
                break
            }
        }
        log.info("probe_worker actor=isolated-worker channel=worker-http selected={} completed={} unfinished={} deferred={} stop={}",
            selected, completed, unfinished, deferred, reason)
        return WorkerResult(selected, completed, unfinished, deferred, reason)
    }
}
