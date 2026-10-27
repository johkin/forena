package se.forena.api.activities

import java.time.Instant
import java.util.UUID
import io.swagger.v3.oas.annotations.media.Schema
import tools.jackson.databind.annotation.JsonSerialize

data class AttendancePerson(
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val personId: UUID,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val displayName: String,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val role: String,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED, types = ["string", "null"]) val response: String?,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED, types = ["boolean", "null"]) val present: Boolean?
)
data class AttendanceGroup(
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val id: UUID,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val label: String,
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC) @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val personIds: List<UUID>
)
data class AttendanceChange(
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val personId: UUID,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val displayName: String,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED, types = ["boolean", "null"]) val previousPresent: Boolean?,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val present: Boolean
)
data class AttendanceHistory(
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val revision: Long,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val actorName: String,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val changedAt: Instant,
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC) @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val changes: List<AttendanceChange>
)
data class AttendanceSnapshot(
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val revision: Long,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED, types = ["string", "null"]) val reportedAt: Instant?,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val status: String,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val writable: Boolean,
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC) @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val roster: List<AttendancePerson>,
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC) @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val candidates: List<AttendancePerson>,
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC) @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val groups: List<AttendanceGroup>,
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC) @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val history: List<AttendanceHistory>
)
data class AttendanceCommand(
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val revision: Long,
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC) @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val rosterIds: List<UUID>,
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC) @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val personIds: List<UUID>,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val confirmEmpty: Boolean = false
)
