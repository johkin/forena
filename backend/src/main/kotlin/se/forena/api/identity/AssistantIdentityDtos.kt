package se.forena.api.identity

import java.util.UUID

data class AssistantOrganization(val id: UUID, val name: String, val timeZone: String)

data class AssistantTeam(val id: UUID, val organizationId: UUID, val name: String)

data class AssistantRoleAssignment(
    val organizationId: UUID,
    val organizationName: String,
    val teamId: UUID?,
    val teamName: String?,
    val sectionId: UUID?,
    val sectionName: String?,
    val role: String,
)

data class AssistantViewer(
    val roles: List<String>,
    val ageGroup: String,
    val roleAssignments: List<AssistantRoleAssignment> = emptyList(),
)
