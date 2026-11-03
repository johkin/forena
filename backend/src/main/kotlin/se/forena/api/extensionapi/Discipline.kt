package se.forena.api.extensionapi

import java.time.Instant
import java.util.UUID
import tools.jackson.databind.JsonNode

/** Stable object anchors. Organization and discipline are always resolved on the server. */
enum class DisciplineScope {
    section,
    team,
    teamMembership,
    activity,
    activityParticipation,
}

enum class FieldAudience {
    managers,
    invitations,
    team,
}

enum class FieldType {
    integer,
    choice,
    choices,
    player,
    players,
}

data class FieldOption(val id: String, val name: String)

data class FieldCondition(val field: String, val value: String)

data class DisciplineField(
    val key: String,
    val title: String,
    val type: FieldType,
    val read: FieldAudience = FieldAudience.managers,
    val write: FieldAudience = FieldAudience.managers,
    val minimum: Int? = null,
    val maximum: Int? = null,
    val options: List<FieldOption> = emptyList(),
    val visibleWhen: FieldCondition? = null,
)

data class CapabilityDefinition(
    val key: String,
    val version: String,
    val name: String,
    val enabledByDefault: Boolean,
    val adjustable: Boolean,
    val configurationScope: String = "team",
)

data class DisciplineDefinition(
    val key: String,
    val version: String,
    val name: String,
    val category: String,
    val fields: Map<DisciplineScope, List<DisciplineField>>,
    val capabilities: List<CapabilityDefinition> = emptyList(),
    val scopeTitles: Map<DisciplineScope, String> = emptyMap(),
)

data class ActivityKind(val slug: String, val category: String)

data class DisciplineValidationContext(
    val activityKind: ActivityKind? = null,
    val teamPlayerIds: Set<UUID> = emptySet(),
    val acceptedPlayerIds: Set<UUID> = emptySet(),
)

/** Definitions are serializable; implementations and their domain rules remain in code. */
interface DisciplinePackage {
    val definition: DisciplineDefinition
    val informationContributors: List<InformationContributor>
        get() = emptyList()

    val activityCapabilities: List<ActivityCapability>
        get() = emptyList()

    val selectable: Boolean
        get() = true

    fun appliesTo(kind: ActivityKind): Boolean

    fun validate(scope: DisciplineScope, values: JsonNode, context: DisciplineValidationContext)

    fun initialActivityValues(teamValues: JsonNode): JsonNode
}

interface DisciplineCatalog {
    fun definitions(): List<DisciplineDefinition>

    fun find(key: String, version: String? = null): DisciplinePackage?
}

data class DisciplineActivity(
    val id: UUID,
    val organizationId: UUID,
    val teamId: UUID,
    val sectionId: UUID?,
    val disciplineKey: String,
    val kind: ActivityKind,
    val startsAt: Instant,
    val endsAt: Instant,
    val generation: Long,
    val cancelled: Boolean,
)

/** Called inside the activity transaction, so the first read already sees the snapshot. */
interface DisciplineActivityLifecycle {
    fun created(activity: DisciplineActivity)

    fun changed(activityId: UUID) {}

    fun updated(activity: DisciplineActivity, previousKind: ActivityKind) {
        changed(activity.id)
    }

    fun invited(activityId: UUID, actorId: UUID, added: Int) {}
}
