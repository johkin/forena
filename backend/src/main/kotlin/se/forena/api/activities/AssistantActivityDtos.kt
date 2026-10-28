package se.forena.api.activities

import java.time.Instant
import java.time.LocalDate
import java.util.UUID

data class AssistantInvitation(
    val id: UUID,
    val personId: UUID,
    val name: String,
    val response: String,
    val responseComment: String?,
    val revision: Long,
)

data class AssistantRosterPerson(val id: UUID, val displayName: String, val role: String)

data class AssistantTeamData(
    val teamId: UUID,
    val organizationId: UUID,
    val teamName: String,
    val organizationName: String,
    val sectionId: UUID?,
    val discipline: String?,
    val timeZone: String,
    val editor: ActivityEditorContext?,
    val invitationAccess: Boolean,
    val attendanceAccess: Boolean,
    val roster: List<AssistantRosterPerson>,
)

data class HistoryPerson(
    val activityId: UUID,
    val title: String,
    val startsAt: Instant,
    val personId: UUID,
    val name: String,
    val present: Boolean?,
    val category: String,
)

data class AssistantHistory(
    val from: LocalDate,
    val through: LocalDate,
    val uniquePeople: Long?,
    val participationCount: Long?,
    val truncated: Boolean,
    val records: List<HistoryPerson>,
    val summaries: List<HistorySummary> = emptyList(),
    val duties: List<DutyHistory> = emptyList(),
    val attendanceAvailable: Boolean = true,
)

data class HistorySummary(
    val category: String,
    val uniquePeople: Long,
    val participationCount: Long,
)

data class DutyHistory(
    val activityId: UUID,
    val title: String,
    val startsAt: Instant,
    val personId: UUID,
    val name: String,
    val duty: String,
    val completed: Boolean,
)

data class InvitationChannelState(
    val invitationId: UUID,
    val personId: UUID,
    val personName: String,
    val activityId: UUID,
    val activityRevision: Long,
    val invitationRevision: Long,
    val response: String,
    val organizationId: UUID,
    val teamId: UUID,
)
