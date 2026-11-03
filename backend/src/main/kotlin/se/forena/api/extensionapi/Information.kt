package se.forena.api.extensionapi

import java.util.UUID
import tools.jackson.databind.JsonNode

data class InformationDefinition(
    val key: String,
    val version: String,
    val title: String,
    val fields: List<DisciplineField>,
    val capabilityKey: String? = null,
)

/** Contributions own validation and completion; the runtime owns persistence and delivery. */
interface InformationContributor {
    val information: InformationDefinition

    fun validate(values: JsonNode, presentPlayerIds: Set<UUID>)

    fun complete(values: JsonNode): Boolean

    fun referencedPlayers(values: JsonNode): Set<UUID>
}

interface InformationCapability : DisciplineCapability, InformationContributor

interface DisciplineBackgroundWork {
    fun runDue(limit: Int = 100): Int
}

interface AttendanceOutcomeGuard {
    fun validateAttendance(activityId: UUID, presentPlayerIds: Set<UUID>)
}

data class PrivateExtensionMessage(
    val id: UUID,
    val subject: UUID,
    val title: String,
    val body: String,
    val path: String,
)

interface ExtensionNotifier {
    fun enqueue(
        activityId: UUID,
        purpose: String,
        recipients: List<UUID>,
        title: String,
        body: String,
    )
}
