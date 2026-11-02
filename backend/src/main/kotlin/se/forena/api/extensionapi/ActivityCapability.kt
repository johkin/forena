package se.forena.api.extensionapi

import java.time.Instant
import java.util.UUID
import tools.jackson.databind.JsonNode

data class CapabilityContext(
    val activityId: UUID,
    val title: String,
    val kind: ActivityKind,
    val startsAt: Instant,
    val evaluatedAt: Instant,
    val eligible: Boolean,
    val values: JsonNode,
    val invitedPlayers: Int,
    val acceptedPlayers: Int,
    val pendingPlayers: Int,
    val responseDueAt: Instant?,
    val lastReminderAt: Instant?,
    val hours: List<Int>,
)

data class CapabilitySignal(
    val type: String,
    val severity: String,
    val title: String,
    val text: String,
    val actions: List<String>,
)

data class CapabilityEvaluation(
    val signal: CapabilitySignal?,
    val nextEvaluationAt: Instant?,
    val checkpoint: Int? = null,
    val notificationTitle: String? = null,
    val notificationBody: String? = null,
)

/** Pure rules receive verified facts. The runtime owns locks, snapshots, jobs and delivery. */
interface ActivityCapability : DisciplineCapability {
    val defaultHours: List<Int>

    fun evaluate(context: CapabilityContext): CapabilityEvaluation
}

/** Published synchronously inside the owning command's transaction. */
data class DisciplineInputsChanged(val activityId: UUID? = null, val teamId: UUID? = null)
