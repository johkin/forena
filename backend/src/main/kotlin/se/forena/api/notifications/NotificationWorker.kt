package se.forena.api.notifications

import java.time.Duration
import org.slf4j.LoggerFactory
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.stereotype.Service
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RestController
import se.forena.api.activities.ScheduledInvitationService
import se.forena.api.extensionapi.DisciplineBackgroundWork
import se.forena.api.notifications.internal.InvitationEmailDelivery
import se.forena.api.notifications.internal.PublicationRecovery

data class NotificationWorkerResult(
    val schedules: Int,
    val recoveryCandidates: Int,
    val processedEmails: Int,
    val processedExtensions: Int,
)

/** Request-bound scheduler entry point. No delivery depends on an in-memory timer after HTTP. */
@Service
class NotificationWorker(
    private val settings: NotificationSettings,
    private val schedules: ScheduledInvitationService,
    private val recovery: PublicationRecovery,
    private val delivery: InvitationEmailDelivery,
    private val operations: NotificationOperations,
    private val disciplineWork: List<DisciplineBackgroundWork>,
    private val extensions: ExtensionNotifications,
) {
    private val logger = LoggerFactory.getLogger(NotificationWorker::class.java)

    fun run(): NotificationWorkerResult {
        check(settings.enabled)
        operations.started()
        val deadline = System.nanoTime() + Duration.ofSeconds(45).toNanos()
        val materialized = schedules.materialize(deadline)
        disciplineWork.forEach { it.runDue(100) }
        val recovered = recovery.recover(deadline)
        extensions.cleanup()
        var delivered = 0
        var deliveredExtensions = 0
        fun canDeliver() =
            delivered + deliveredExtensions < 50 &&
                System.nanoTime() + Duration.ofSeconds(16).toNanos() < deadline &&
                !Thread.currentThread().isInterrupted
        // Alternate queues within one shared request budget so neither transport can starve the
        // other.
        while (canDeliver()) {
            var progressed = false
            if (delivery.deliverOne()) {
                delivered++
                progressed = true
            }
            if (canDeliver() && extensions.deliverOne()) {
                deliveredExtensions++
                progressed = true
            }
            if (!progressed) break
        }
        logger.info(
            "notification_worker schedules={} recovery_candidates={} processed_emails={} processed_extensions={}",
            materialized,
            recovered,
            delivered,
            deliveredExtensions,
        )
        operations.completed()
        return NotificationWorkerResult(materialized, recovered, delivered, deliveredExtensions)
    }
}

@RestController
class NotificationWorkerController(
    private val worker: NotificationWorker,
    private val operations: NotificationOperations,
) {
    @GetMapping("/internal/notifications/status")
    fun status(): ResponseEntity<NotificationStatus> =
        ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(operations.status())

    @PostMapping("/internal/notifications/run")
    fun run(): ResponseEntity<NotificationWorkerResult> =
        ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(worker.run())
}
