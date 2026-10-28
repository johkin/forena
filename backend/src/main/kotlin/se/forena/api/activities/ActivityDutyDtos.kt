package se.forena.api.activities

import java.time.Instant
import java.util.UUID

data class ActivityDutyCommand(
    val teamId: UUID,
    val activityIds: List<UUID>,
    val name: String,
    val places: Int,
    val instructions: String = "",
)

data class DutyTarget(
    val id: UUID,
    val title: String,
    val startsAt: Instant,
    val endsAt: Instant,
    val revision: Long,
    val category: String,
    val sourceKind: String,
    val seriesId: UUID?,
    val externalSource: String?,
    val venue: String?,
    val exists: Boolean,
)

data class DutyTargets(val activities: List<DutyTarget>, val truncated: Boolean)
