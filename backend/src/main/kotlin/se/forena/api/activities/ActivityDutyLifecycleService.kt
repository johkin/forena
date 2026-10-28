package se.forena.api.activities

import java.time.Instant
import java.util.UUID
import org.springframework.stereotype.Service
import se.forena.api.activities.internal.ActivityDutyLifecycleRepository

/** Invoked inside the owning activity transaction; completed work remains historical. */
@Service
class ActivityDutyLifecycleService(private val repository: ActivityDutyLifecycleRepository) {
    fun follow(activity: UUID, start: Instant, end: Instant, cancelled: Boolean) {
        repository.followActivity(start, end, cancelled, activity)
    }
}
