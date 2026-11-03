package se.forena.api.extensions.internal

import java.time.Instant
import java.util.UUID
import org.springframework.data.annotation.Id
import org.springframework.data.relational.core.mapping.Table

@Table(value = "discipline_value", schema = "forena")
data class DisciplineValueEntity(
    @Id val id: UUID,
    val organizationId: UUID,
    val teamId: UUID,
    val disciplineKey: String,
    val packageVersion: String,
    val scope: String,
    val anchorId: UUID,
    val activityId: UUID?,
    val personId: UUID?,
    val revision: Long,
    val valuesJson: String,
)

@Table(value = "discipline_information", schema = "forena")
data class InformationEntity(
    @Id val id: UUID,
    val activityId: UUID,
    val teamId: UUID,
    val organizationId: UUID,
    val ownerKey: String,
    val definitionVersion: String,
    val disciplineKey: String,
    val packageVersion: String,
    val valuesJson: String,
    val revision: Long,
    val state: String,
    val closeReason: String?,
    val createdAt: Instant,
)

data class CapabilitySettingRow(
    val capabilityKey: String,
    val enabled: Boolean,
    val enabledAt: Instant,
    val revision: Long,
)

data class InformationHistoryRow(
    val informationId: UUID,
    val revision: Long,
    val actorName: String,
    val changedAt: Instant,
    val previousJson: String,
    val valuesJson: String,
    val state: String,
    val namesJson: String,
)

data class InformationJobRow(val activityId: UUID, val dueAt: Instant)

@Table(value = "discipline_catalogue", schema = "forena")
data class DisciplineCatalogueEntity(
    @Id val key: String,
    val name: String,
    val categoryKey: String,
    val codeOwned: Boolean,
)

@Table(value = "discipline_category", schema = "forena")
data class DisciplineCategoryEntity(@Id val key: String, val name: String)

@Table(value = "activity_capability", schema = "forena")
data class ActivityCapabilityEntity(
    @Id val activityId: UUID,
    val capabilityKey: String,
    val disciplineKey: String,
    val packageVersion: String,
    val definitionVersion: String,
    val notificationsEnabled: Boolean,
    val hoursJson: String,
)

data class CapabilityEvaluationRow(val activityId: UUID, val revision: Long)

@Table(value = "capability_signal", schema = "forena")
data class CapabilitySignalEntity(
    @Id val id: UUID,
    val activityId: UUID,
    val teamId: UUID,
    val disciplineKey: String,
    val capabilityKey: String,
    val signalType: String,
    val state: String,
    val severity: String,
    val title: String,
    val text: String,
    val actionsJson: String,
    val revision: Long,
    val episode: Long,
    val evaluatedAt: Instant,
)

data class SignalActionRow(
    val signalId: UUID,
    val episode: Long,
    val actorSubject: UUID,
    val action: String,
    val result: String,
    val createdAt: Instant,
)
