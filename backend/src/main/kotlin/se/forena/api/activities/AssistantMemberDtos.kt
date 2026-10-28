package se.forena.api.activities

import java.util.UUID

data class AssistantMember(
    val personId: UUID,
    val name: String,
    val teamId: UUID,
    val teamName: String,
    val role: String,
    val responsibility: String?,
)

data class AssistantMembers(
    val uniquePeople: Long,
    val assignments: List<AssistantMember>,
    val truncated: Boolean,
)
