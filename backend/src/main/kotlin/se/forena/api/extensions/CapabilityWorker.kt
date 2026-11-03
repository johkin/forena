package se.forena.api.extensions

import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import se.forena.api.extensionapi.DisciplineBackgroundWork

@Component
class CapabilityWorker(private val runtime: CapabilityRuntime) : DisciplineBackgroundWork {
    private val logger = LoggerFactory.getLogger(CapabilityWorker::class.java)

    override fun runDue(limit: Int): Int {
        var evaluated = 0
        while (evaluated < limit.coerceIn(1, 500)) {
            val batch = runtime.due(minOf(100, limit.coerceIn(1, 500) - evaluated))
            if (batch.isEmpty()) break
            batch.forEach { job ->
                if (Thread.currentThread().isInterrupted) return evaluated
                try {
                    runtime.process(job.activityId)
                } catch (error: Exception) {
                    if (error is InterruptedException) {
                        Thread.currentThread().interrupt()
                        return evaluated
                    }
                    runtime.failed(job.activityId, job.revision)
                    logger.warn("capability_evaluation_failed activity={}", job.activityId)
                }
                evaluated++
            }
        }
        return evaluated
    }

    @Scheduled(
        fixedDelayString = "\${forena.disciplines.poll-ms:60000}",
        initialDelayString = "\${forena.disciplines.poll-ms:60000}",
    )
    fun poll() {
        runDue(500)
    }
}
