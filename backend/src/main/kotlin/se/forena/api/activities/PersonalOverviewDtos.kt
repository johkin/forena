package se.forena.api.activities

import com.fasterxml.jackson.annotation.JsonProperty
import java.time.Instant
import java.util.UUID
import io.swagger.v3.oas.annotations.media.Schema
import tools.jackson.databind.annotation.JsonSerialize

data class PersonalOrganization(
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val id: UUID,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val name: String,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val time_zone: String,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED, types = ["string", "null"]) val role: String?
)
data class PersonalTeam(
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val id: UUID,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val organization_id: UUID,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val name: String,
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC)
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val roles: List<String>
)
data class ActivityPerson(
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val id: UUID,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val name: String,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true) val invitation: AccessibleInvitation?,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val attendance: String = "unknown"
)
data class PersonalActivity(
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val id: UUID,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val title: String,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val starts_at: Instant,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val ends_at: Instant,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED, types = ["string", "null"]) val gathering_at: Instant?,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED, types = ["string", "null"]) val response_due_at: Instant?,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val location: String,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val description: String,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val status: String,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val organization: PersonalOrganization,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val team: PersonalTeam,
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC)
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val people: List<ActivityPerson>,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val can_manage_activities: Boolean,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val can_manage_attendance: Boolean = false
)
data class PersonalOverview(
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val reference_time: Instant,
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC)
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val activities: List<PersonalActivity>,
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC)
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val organizations: List<PersonalOrganization>,
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC)
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val teams: List<PersonalTeam>,
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC)
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val calendar_people: List<CalendarPerson>,
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC)
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val calendar_teams: List<CalendarTeam>
)


data class CalendarPerson(
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val id: UUID,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val displayName: String,
    @get:JsonProperty("isSelf") @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val isSelf: Boolean,
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC)
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val teamIds: List<UUID>
)
data class CalendarTeam(
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val id: UUID,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val name: String
)
data class PersonalCalendar(
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val reference_time: Instant,
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC)
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val activities: List<PersonalActivity>,
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC)
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val people: List<CalendarPerson>,
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC)
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val teams: List<CalendarTeam>
)
