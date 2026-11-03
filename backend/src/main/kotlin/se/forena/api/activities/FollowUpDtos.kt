package se.forena.api.activities

import java.time.Instant
import java.util.UUID
import se.forena.api.extensionapi.ActivityKind

data class FollowUpActivity(
    val id: UUID,
    val organizationId: UUID,
    val teamId: UUID,
    val disciplineKey: String,
    val slug: String,
    val category: String,
    val title: String,
    val startsAt: Instant,
    val endsAt: Instant,
    val revision: Long,
    val status: String,
    val timeZone: String,
    val deletedAt: Instant?,
    val imported: Boolean,
    val responseDueAt: Instant?,
) {
    val kind
        get() = ActivityKind(slug, category)

    val cancelled
        get() = status == "cancelled" || deletedAt != null
}

data class FollowUpFacts(
    val activity: FollowUpActivity,
    val attendanceRevision: Long,
    val presentPlayers: List<DisciplinePlayer>,
    val canManageAttendance: Boolean,
)

data class CapabilityPlayerCounts(val invited: Int, val accepted: Int, val pending: Int)

data class CapabilityCreationSettings(
    val key: String,
    val version: String,
    val enabled: Boolean,
    val hours: List<Int>,
)

data class TeamReportPeriod(val timeZone: String, val season: String)
