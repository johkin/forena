package se.forena.api.mcp

import java.time.Instant
import java.util.UUID

data class McpActivity(
    val id: UUID,
    val title: String,
    val starts_at: Instant,
    val ends_at: Instant,
    val organization: String,
    val team: String,
    val location: String
)

data class McpActivities(val activities: List<McpActivity>, val limit: Int, val truncated: Boolean)
