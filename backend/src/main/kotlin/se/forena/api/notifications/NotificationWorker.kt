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
import se.forena.api.notifications.internal.InvitationEmailDelivery
import se.forena.api.notifications.internal.PublicationRecovery

data class NotificationWorkerResult(
    val schedules: Int,
    val recoveryCandidates: Int,
    val processedEmails: Int,
)

/** Request-bound scheduler entry point. No delivery depends on an in-memory timer after HTTP. */
@Service
class NotificationWorker(
    private val settings: NotificationSettings,
    private val schedules: ScheduledInvitationService,
    private val recovery: PublicationRecovery,
    private val delivery: InvitationEmailDelivery,
    private val operations: NotificationOperations,
) {
    private val logger = LoggerFactory.getLogger(NotificationWorker::class.java)

    fun run(): NotificationWorkerResult {
        check(settings.enabled)
        operations.started()
        val deadline = System.nanoTime() + Duration.ofSeconds(45).toNanos()
        val materialized = schedules.materialize(deadline)
        val recovered = recovery.recover(deadline)
        var delivered = 0
        // Leave room for the existing Resend connect/read timeouts before starting another HTTP
        // call.
        while (
            delivered < 50 &&
                System.nanoTime() + Duration.ofSeconds(16).toNanos() < deadline &&
                !Thread.currentThread().isInterrupted &&
                delivery.deliverOne()
        ) {
            delivered++
        }
        logger.info(
            "notification_worker schedules={} recovery_candidates={} processed_emails={}",
            materialized,
            recovered,
            delivered,
        )
        operations.completed()
        return NotificationWorkerResult(materialized, recovered, delivered)
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
