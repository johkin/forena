package se.forena.probe.delivery

import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import org.slf4j.LoggerFactory
import se.forena.probe.delivery.internal.BoundedResubmission
import se.forena.probe.delivery.internal.PendingPublications
import se.forena.probe.effects.EffectControl
import java.time.Duration
import java.util.UUID
import java.util.concurrent.locks.ReentrantLock

data class WorkerResult(
    val selected: List<UUID>,
    val completed: List<UUID>,
    val unfinished: List<UUID>,
    val deferred: List<UUID>,
    val stopReason: String,
    val examined: Int = 0
)

/** Request-bound, bounded draining. Persistent cursor is scheduling progress, Modulith owns delivery. */
@Service
class ProbeWorker(
    private val pending: PendingPublications,
    private val effects: EffectControl,
    private val publications: BoundedResubmission,
    @Value("\${probe.worker.batch-size:2}") private val batchSize: Int,
    @Value("\${probe.worker.budget:PT120S}") private val budget: Duration,
    @Value("\${probe.worker.stale-after:PT120S}") private val staleAfter: Duration,
    @Value("\${probe.worker.reserve:PT5S}") private val reserve: Duration,
    @Value("\${probe.worker.max-publications:64}") private val maxPublications: Int,
    @Value("\${probe.worker.max-candidates:256}") private val maxCandidates: Int,
    @Value("\${probe.worker.start-grace:PT5S}") private val startGrace: Duration
) {
    private val log = LoggerFactory.getLogger(ProbeWorker::class.java)
    private val invocation = ReentrantLock()
    init {
        require(batchSize in 1..10)
        require(maxPublications in 1..1000 && maxCandidates in maxPublications..10000)
        require(!budget.isNegative && !budget.isZero && budget <= Duration.ofSeconds(180))
        require(!staleAfter.isNegative)
        require(!reserve.isNegative && reserve < budget)
        require(!startGrace.isNegative && startGrace <= Duration.ofSeconds(30))
    }

    fun run(): WorkerResult {
        if (Thread.currentThread().isInterrupted) return empty("interrupted")
        if (!invocation.tryLock()) return empty("worker-busy")
        return try { drain() } finally { invocation.unlock() }
    }

    private fun empty(reason: String) = WorkerResult(emptyList(), emptyList(), emptyList(), emptyList(), reason)

    private fun drain(): WorkerResult {
        val deadline = System.nanoTime() + budget.toNanos()
        var cursor = pending.cursor()
        val selected = mutableListOf<UUID>()
        val completed = mutableListOf<UUID>()
        val unfinished = mutableListOf<UUID>()
        val deferred = mutableListOf<UUID>()
        var examined = 0
        var reason = "cycle-complete"
        scan@ while (true) {
            if (Thread.currentThread().isInterrupted) { reason = "interrupted"; break }
            if (System.nanoTime() + reserve.toNanos() >= deadline) { reason = "budget"; break }
            if (selected.size >= maxPublications) { reason = "publication-limit"; break }
            if (examined >= maxCandidates) { reason = "scan-limit"; break }
            val candidates = pending.oldest(staleAfter, minOf(batchSize, maxCandidates - examined), cursor.position)
            if (candidates.isEmpty()) {
                // Wrap on the NEXT invocation, so a failed/deferred event cannot hot-loop here.
                if (!pending.advance(cursor.revision, null)) reason = "cursor-contended"
                break
            }
            for (candidate in candidates) {
                if (Thread.currentThread().isInterrupted) { reason = "interrupted"; break@scan }
                if (System.nanoTime() + reserve.toNanos() >= deadline) { reason = "budget"; break@scan }
                if (selected.size >= maxPublications) { reason = "publication-limit"; break@scan }
                // Persist before dispatch: process loss never loses the publication, and the next
                // invocation can pass a crashing candidate. A later full cycle revisits it.
                if (!pending.advance(cursor.revision, candidate.position)) {
                    reason = "cursor-contended"
                    break@scan
                }
                cursor = cursor.copy(revision = cursor.revision + 1, position = candidate.position)
                examined++
                if (effects.hasRecentAttempt(candidate.runId, staleAfter)) {
                    deferred.add(candidate.runId)
                    continue
                }
                if (System.nanoTime() + Duration.ofMillis(candidate.delayMs).toNanos() + reserve.toNanos() >= deadline) {
                    deferred.add(candidate.runId)
                    continue
                }
                // No transaction/connection spans the request, listener wait or cursor checkpoints.
                effects.release(candidate.runId)
                selected.add(candidate.runId)
                publications.resubmit(candidate.publicationId, deadline)
                val attemptDeadline = minOf(deadline, System.nanoTime() +
                    Duration.ofMillis(candidate.delayMs).plus(reserve).plus(startGrace).toNanos())
                var state = pending.state(candidate.publicationId)
                while (!state.completed && !state.failed && System.nanoTime() < attemptDeadline) {
                    try { Thread.sleep(100) }
                    catch (_: InterruptedException) { Thread.currentThread().interrupt(); break }
                    state = pending.state(candidate.publicationId)
                }
                if (state.completed) completed.add(candidate.runId) else unfinished.add(candidate.runId)
                // FAILED or a stalled attempt does not monopolize the remaining request budget.
                // Cursor progression ensures at most one attempt at this publication per cycle.
            }
        }
        log.info("probe_worker actor=isolated-worker channel=worker-http selected={} completed={} unfinished={} deferred={} examined={} stop={}",
            selected, completed, unfinished, deferred, examined, reason)
        return WorkerResult(selected, completed, unfinished, deferred, reason, examined)
    }
}
