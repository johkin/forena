package se.forena.api.activities

import java.util.UUID
import se.forena.api.extensionapi.DisciplineScope
import se.forena.api.extensionapi.DisciplineValidationContext

data class DisciplineTarget(
    val teamId: UUID,
    val scope: DisciplineScope,
    val activityId: UUID? = null,
    val personId: UUID? = null,
)

data class DisciplinePlayer(val id: UUID, val name: String)

data class DisciplineObject(
    val organizationId: UUID,
    val teamId: UUID,
    val anchorId: UUID,
    val disciplineKey: String,
    val activityId: UUID?,
    val personId: UUID?,
    val editable: Boolean,
    val canManage: Boolean,
    val canManageInvitations: Boolean,
    val teamMember: Boolean,
    val context: DisciplineValidationContext,
    val teamPlayers: List<DisciplinePlayer>,
    val acceptedPlayers: List<DisciplinePlayer>,
    val participants: List<DisciplinePlayer>,
)

data class ActivityCapacity(val maxParticipants: Int?, val acceptedParticipants: Int)
