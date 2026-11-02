package se.forena.api.activities

import java.util.UUID
import tools.jackson.databind.JsonNode

data class DefaultsWorkspace(
    val organizationId: UUID,
    val scope: String,
    val scopeId: UUID,
    val sectionId: UUID?,
    val disciplineKey: String,
    val version: String,
    val types: List<ManagedActivityType>,
    val rows: List<ActivityDefaultsRow>,
)

data class DefaultsCommand(
    val scope: String,
    val scopeId: UUID,
    val activityTypeId: UUID,
    val revision: Long,
    val values: JsonNode,
)
