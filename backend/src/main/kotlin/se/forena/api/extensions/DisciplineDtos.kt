package se.forena.api.extensions

import java.util.UUID
import se.forena.api.activities.DisciplinePlayer
import se.forena.api.extensionapi.DisciplineField
import se.forena.api.extensionapi.DisciplineScope
import tools.jackson.databind.JsonNode

data class DisciplineFieldsSnapshot(
    val disciplineKey: String,
    val version: String?,
    val enabled: Boolean,
    val editable: Boolean,
    val canManageInvitations: Boolean,
    val fields: List<DisciplineField>,
    val values: JsonNode,
    val revision: Long,
    val teamPlayers: List<DisciplinePlayer>,
    val acceptedPlayers: List<DisciplinePlayer>,
    val participants: List<DisciplinePlayer>,
    val title: String,
)

data class DisciplineFieldsCommand(
    val teamId: UUID,
    val scope: DisciplineScope,
    val activityId: UUID? = null,
    val personId: UUID? = null,
    val disciplineKey: String,
    val version: String,
    val revision: Long,
    val values: JsonNode,
)
