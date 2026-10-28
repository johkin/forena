package se.forena.api.identity

import java.util.UUID

data class AssistantOrganization(val id: UUID, val name: String, val timeZone: String)

data class AssistantTeam(val id: UUID, val organizationId: UUID, val name: String)

data class AssistantViewer(val roles: List<String>, val ageGroup: String)
