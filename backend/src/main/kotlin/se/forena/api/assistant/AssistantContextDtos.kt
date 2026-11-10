package se.forena.api.assistant

import java.util.UUID
import se.forena.api.activities.ActivityAudienceGroup
import se.forena.api.activities.ActivityDefaultsRow
import se.forena.api.activities.AssistantTeamData
import se.forena.api.activities.ManagedActivityType
import se.forena.api.activities.ManagedTeam

/** Unloaded rosters are omitted rather than represented as verified empty lists. */
data class AssistantTeamSummary(
    val teamId: UUID,
    val organizationId: UUID,
    val teamName: String,
    val organizationName: String,
    val sectionId: UUID?,
    val discipline: String?,
    val timeZone: String,
    val invitationAccess: Boolean,
    val attendanceAccess: Boolean,
    val editor: AssistantEditorSummary?,
)

data class AssistantEditorSummary(
    val team: ManagedTeam,
    val types: List<ManagedActivityType>,
    val disciplineKey: String?,
    val sectionId: UUID?,
    val defaults: List<ActivityDefaultsRow>,
    val groups: List<ActivityAudienceGroup>,
)

fun AssistantTeamData.promptSummary() = AssistantTeamSummary(
    teamId, organizationId, teamName, organizationName, sectionId, discipline, timeZone,
    invitationAccess, attendanceAccess,
    editor?.let { AssistantEditorSummary(it.team, it.types, it.disciplineKey, it.sectionId, it.defaults, it.groups) },
)
