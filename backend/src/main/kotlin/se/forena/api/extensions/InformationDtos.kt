package se.forena.api.extensions

import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import se.forena.api.activities.AttendanceCommand
import se.forena.api.activities.DisciplinePlayer
import se.forena.api.extensionapi.InformationDefinition
import tools.jackson.databind.JsonNode

data class InformationAnswer(val ownerKey: String, val revision: Long, val values: JsonNode)

data class InformationCommand(
    val answers: List<InformationAnswer>,
    val attendance: AttendanceCommand? = null,
)

data class InformationItem(
    val definition: InformationDefinition,
    val revision: Long,
    val state: String,
    val closeReason: String?,
    val values: JsonNode,
)

data class InformationHistory(
    val ownerKey: String,
    val revision: Long,
    val actorName: String,
    val changedAt: Instant,
    val previous: JsonNode,
    val values: JsonNode,
    val state: String,
    val names: Map<String, String>,
)

data class InformationSnapshot(
    val activityId: UUID,
    val title: String,
    val attendanceRevision: Long,
    val canManageAttendance: Boolean,
    val editable: Boolean,
    val players: List<DisciplinePlayer>,
    val contributions: List<InformationItem>,
    val history: List<InformationHistory>,
)

data class CapabilitySetting(
    val key: String,
    val name: String,
    val enabled: Boolean,
    val adjustable: Boolean,
    val revision: Long,
    val editable: Boolean,
)

data class CapabilityChange(val key: String, val enabled: Boolean, val revision: Long)

data class InformationReportEntry(
    val activityId: UUID,
    val title: String,
    val startsAt: Instant,
    val contributions: List<InformationItem>,
)

data class InformationReport(
    val teamId: UUID,
    val from: Instant,
    val until: Instant,
    val entries: List<InformationReportEntry>,
    val players: List<DisciplinePlayer>,
)

data class PendingInformation(
    val activityId: UUID,
    val title: String,
    val startsAt: Instant,
    val missing: List<String>,
)

data class InformationPeriodReport(
    val timeZone: String,
    val season: String,
    val fromDate: LocalDate,
    val untilDate: LocalDate,
    val report: InformationReport,
)
