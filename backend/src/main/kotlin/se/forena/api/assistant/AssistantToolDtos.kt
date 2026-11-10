package se.forena.api.assistant

import se.forena.api.activities.AssistantInvitation
import se.forena.api.activities.AttendancePerson
import se.forena.api.extensions.SignalSnapshot

data class ToolInvitations(
    val invitations: List<AssistantInvitation>,
    val invitationSummary: Map<String, Int>,
    val invitationSummaryScope: String,
    val truncated: Boolean,
)

data class ToolAttendance(
    val revision: Long,
    val status: String,
    val writable: Boolean,
    val roster: List<AttendancePerson>,
)

data class ToolSignals(val signals: List<SignalSnapshot>, val truncated: Boolean)
