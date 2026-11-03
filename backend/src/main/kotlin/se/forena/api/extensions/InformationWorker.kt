package se.forena.api.extensions

import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import se.forena.api.extensionapi.DisciplineBackgroundWork

@Service
class InformationWorker(private val information: InformationService) : DisciplineBackgroundWork {
    private val logger = LoggerFactory.getLogger(InformationWorker::class.java)

    override fun runDue(limit: Int): Int {
        require(limit in 1..500)
        val jobs = information.due(limit)
        var completed = 0
        jobs.forEach { job ->
            if (Thread.currentThread().isInterrupted) return completed
            try {
                information.process(job.activityId)
            } catch (error: Exception) {
                if (error is InterruptedException) {
                    Thread.currentThread().interrupt()
                    return completed
                }
                information.failed(job.activityId)
                logger.warn("information_request_failed activity={}", job.activityId)
            }
            completed++
        }
        return completed
    }

    @Scheduled(
        fixedDelayString = "\${forena.disciplines.poll-ms:60000}",
        initialDelayString = "\${forena.disciplines.poll-ms:60000}",
    )
    fun processDue() {
        runDue(100)
    }
}
