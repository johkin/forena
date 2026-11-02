package se.forena.api.activities

import java.util.UUID
import org.springframework.stereotype.Service
import se.forena.api.activities.internal.CapacityRepository

/** The activity lock must be held by every caller changing a counted response. */
@Service
class ActivityCapacityService(private val repository: CapacityRepository) {
    fun checkAcceptance(activity: UUID, person: UUID) {
        val capacity = repository.capacity(activity)
        if (capacity.maxParticipants == null || !repository.participant(activity, person)) return
        check(capacity.acceptedParticipants < capacity.maxParticipants) { "activity.capacity.full" }
    }

    fun capacity(activity: UUID) = repository.capacity(activity)

    fun consumesPlace(activity: UUID, person: UUID) = repository.participant(activity, person)
}
