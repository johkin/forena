package se.forena.api.assistant

import java.util.UUID

data class ConfirmationResult(
    val confirmed: Boolean,
    val message: String,
    val proposal: AssistantProposal? = null,
)

data class ReminderDraft(val activityId: UUID)
