package se.forena.api.assistant

import java.time.Instant
import java.util.UUID
import se.forena.api.activities.ActivityCommand
import se.forena.api.activities.ActivitySeriesCommand

data class Conversation(
    val id: UUID,
    val subject: UUID,
    val organizationId: UUID?,
    val channel: String,
    val active: Boolean,
    val revision: Long,
    val teamId: UUID?,
    val activityId: UUID?,
    val createdAt: Instant,
    val updatedAt: Instant,
)

data class ConversationCommand(val organizationId: UUID? = null, val teamId: UUID? = null)

data class ConversationView(
    val conversation: Conversation,
    val messages: List<AssistantMessage>,
    val proposals: List<AssistantProposal>,
)

data class AssistantMessage(
    val id: UUID,
    val conversationId: UUID,
    val role: String,
    val sender: String,
    val organizationId: UUID?,
    val content: String,
    val createdAt: Instant,
)

data class MessageCommand(val text: String, val teamId: UUID? = null, val activityId: UUID? = null)

data class AssistantProposal(
    val id: UUID,
    val conversationId: UUID,
    val subject: UUID,
    val organizationId: UUID?,
    val teamId: UUID?,
    val kind: String,
    val label: String,
    val payload: String,
    val fingerprint: String,
    val state: String,
    val expiresAt: Instant,
    val createdAt: Instant,
)

data class AssistantReply(
    val sender: String,
    val organizationId: UUID?,
    val text: String,
    val proposals: List<AssistantProposal> = emptyList(),
    val failed: Boolean = false,
    val pending: Boolean = false,
)

data class AssistantProfile(
    val name: String,
    val personality: String = "",
    val instructions: String = "",
    val revision: Long = 0,
)

data class SectionProfile(val instructions: String = "", val revision: Long = 0)

data class AssistantMemory(
    val id: UUID,
    val subject: UUID?,
    val organizationId: UUID?,
    val sectionId: UUID?,
    val teamId: UUID?,
    val disciplineKey: String?,
    val content: String,
    val createdBy: UUID,
    val createdAt: Instant,
    val revision: Long,
)

data class MemoryDraft(
    val scope: String = "personal",
    val organizationId: UUID? = null,
    val sectionId: UUID? = null,
    val teamId: UUID? = null,
    val disciplineKey: String? = null,
    val content: String,
)

data class ResponseDraft(
    val invitationIds: List<UUID>,
    val response: String,
    val comment: String? = null,
    val commentProvided: Boolean = false,
)

data class AttendanceDraft(val activityId: UUID, val changes: List<PersonAttendance>)

data class PersonAttendance(val personId: UUID, val present: Boolean)

/**
 * Provider output has no execution path. Every draft is separately authorized, normalized and
 * stored.
 */
data class ModelAnswer(
    val answer: String,
    val memory: MemoryDraft? = null,
    val activity: ActivityCommand? = null,
    val series: ActivitySeriesCommand? = null,
    val reminderActivityId: UUID? = null,
    val duty: se.forena.api.activities.ActivityDutyCommand? = null,
    val response: ResponseDraft? = null,
    val attendance: AttendanceDraft? = null,
)

data class AssistantTarget(
    val organizationId: UUID,
    val teamId: UUID? = null,
    val activityId: UUID? = null,
    val historyFrom: java.time.LocalDate? = null,
    val historyThrough: java.time.LocalDate? = null,
    val question: String? = null,
)

data class RoutingPlan(
    val targets: List<AssistantTarget> = emptyList(),
    val clarification: String? = null,
)
