package se.forena.api.activities

import java.time.Instant
import java.util.UUID
import tools.jackson.databind.annotation.JsonSerialize

data class AttendanceCommand(@get:JsonSerialize(typing = JsonSerialize.Typing.STATIC) val personIds: List<UUID>)
data class AttendancePerson(val personId: UUID, val displayName: String, val role: String, val response: String?, val present: Boolean)
data class AttendanceGroup(val id: UUID, val label: String,
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC) val personIds: List<UUID>)
data class AttendanceSnapshot(val started: Boolean, val reportedAt: Instant?,
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC) val roster: List<AttendancePerson>,
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC) val groups: List<AttendanceGroup>)
