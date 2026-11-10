package se.forena.api.assistant

import java.time.Instant
import java.util.UUID

/** Public tool responses deliberately exclude people, comments and assistant instructions. */
data class SharedActivity(
    val id: UUID,
    val title: String,
    val starts_at: Instant,
    val ends_at: Instant,
    val organization: String,
    val team: String,
    val location: String,
)

data class SharedActivities(val activities: List<SharedActivity>, val limit: Int, val truncated: Boolean)

data class SharedTeam(val id: UUID, val organizationId: UUID, val name: String)

data class SharedTeams(
    val teams: List<SharedTeam>,
    val nextOffset: Int?,
    val limit: Int,
    val truncated: Boolean,
)

data class SharedTeamOverview(
    val team: SharedTeam,
    val organization: String,
    val timeZone: String,
    val activities: List<SharedActivity>,
    val limit: Int,
    val truncated: Boolean,
)

data class SharedNames(val names: List<String>, val limit: Int, val truncated: Boolean)
