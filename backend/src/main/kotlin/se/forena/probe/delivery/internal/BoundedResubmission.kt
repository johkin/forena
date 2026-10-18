package se.forena.probe.delivery.internal

import org.springframework.modulith.events.EventPublication.Status
import org.springframework.modulith.events.IncompleteEventPublications
import org.springframework.modulith.events.core.EventSerializer
import org.springframework.modulith.events.core.PublicationTargetIdentifier
import org.springframework.modulith.events.core.TargetEventPublication
import org.springframework.stereotype.Service
import se.forena.probe.commands.ProbeRequested
import java.util.UUID

/** Exact-ID projection of the locked v2 schema; no registry writes or custom delivery state machine. */
@Service
class BoundedResubmission(
    private val reads: PendingPublications,
    private val serializer: EventSerializer,
    private val publications: IncompleteEventPublications
) {
    fun resubmit(id: UUID, deadline: Long) {
        if (Thread.currentThread().isInterrupted || System.nanoTime() >= deadline) return
        val rows = reads.exact(id) { rs ->
            val event = serializer.deserialize(rs.getString("serialized_event"), ProbeRequested::class.java)
            val base = TargetEventPublication.of(event,
                PublicationTargetIdentifier.of(rs.getString("listener_id")),
                rs.getTimestamp("publication_date").toInstant())
            val status = Status.valueOf(rs.getString("status"))
            val last = rs.getTimestamp("last_resubmission_date")?.toInstant()
            val attempts = rs.getInt("completion_attempts")
            object : TargetEventPublication by base {
                override fun getIdentifier() = id
                override fun getStatus() = if (base.isCompleted) Status.COMPLETED else status
                override fun getLastResubmissionDate() = last
                override fun getCompletionAttempts() = attempts
            }
        }
        RegistryReadScope.withPublication(rows) {
            publications.resubmitIncompletePublications { it.identifier == id &&
                !Thread.currentThread().isInterrupted && System.nanoTime() < deadline }
        }
    }
}
