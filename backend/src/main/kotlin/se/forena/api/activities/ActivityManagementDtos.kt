package se.forena.api.activities

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.util.UUID
import tools.jackson.databind.annotation.JsonSerialize

data class ActivityTimingRules(
    val duration: String = "PT1H30M",
    val gatheringRule: String = "start",
    val invitationRule: String = "start-6d",
    val responseDueRule: String = "start-6h",
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC) val reminderRules: List<String> = listOf("deadline-1d", "deadline-2h")
)

data class ActivityAudience(
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC) val roles: List<String> = emptyList(),
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC) val groupIds: List<UUID> = emptyList(),
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC) val responsibilityTypeIds: List<UUID> = emptyList()
)

data class ActivityCommand(
    val teamId: UUID? = null,
    val activityTypeId: UUID? = null,
    val title: String,
    val description: String = "",
    val location: String = "",
    val startsAt: Instant,
    val endsAt: Instant,
    val gatheringAt: Instant? = null,
    val timingRules: ActivityTimingRules? = null,
    val invitationMode: String = "none",
    val invitationAudience: String? = null,
    val invitationSelection: ActivityAudience? = null,
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC) val personIds: List<UUID> = emptyList(),
    val revision: Long? = null
)

data class ActivitySeriesCommand(
    val teamId: UUID,
    val activityTypeId: UUID? = null,
    val title: String,
    val description: String = "",
    val location: String = "",
    val startsOn: LocalDate,
    val endsOn: LocalDate,
    val startTime: LocalTime,
    val timeZone: String,
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC) val weekdays: List<Int>,
    val timingRules: ActivityTimingRules,
    val invitationMode: String = "none",
    val invitationAudience: String? = null,
    val invitationSelection: ActivityAudience? = null
)

data class ActivitySeriesResult(
    val seriesId: UUID,
    val count: Int,
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC) val activities: List<ManagedActivity>
)

data class ManagedTeam(
    val id: UUID,
    val organizationId: UUID,
    val name: String,
    val organizationName: String,
    val timeZone: String,
    val canManageInvitations: Boolean
)

data class ActivityParticipant(
    val id: UUID,
    val displayName: String,
    val role: String
)

data class ManagedActivity(
    val id: UUID,
    val organization_id: UUID,
    val team_id: UUID,
    val activity_type_id: UUID?,
    val title: String,
    val description: String,
    val location: String,
    val starts_at: Instant,
    val ends_at: Instant,
    val gathering_at: Instant?,
    val status: String,
    val revision: Long
)

data class ActivityResult(
    val activity: ManagedActivity
)

data class ActivityDisposition(
    val disposition: String = "cancelled"
)

data class CancellationCommand(
    val reason: String? = null,
    val revision: Long? = null
)

data class ActivityEditorContext(
    val team: ManagedTeam,
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC) val types: List<ManagedActivityType>,
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC) val members: List<ActivityParticipant>,
    val disciplineKey: String?,
    val sectionId: UUID?,
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC) val defaults: List<ActivityDefaultsRow>,
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC) val groups: List<ActivityAudienceGroup>,
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC) val activities: List<ManagedActivity>
)

data class ManagedActivityType(
    val id: UUID,
    val name: String,
    val slug: String,
    val system_category: String,
    val organization_id: UUID?
)

data class ActivityDefaultsRow(
    val id: UUID,
    val activityTypeId: UUID,
    val scope: String,
    val scopeId: UUID,
    val disciplineKey: String,
    val version: String,
    val revision: Long,
    val valuesJson: String
)

data class ActivityAudienceGroup(
    val id: UUID,
    val name: String,
    val kind: String,
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC) val personIds: List<UUID>
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class ActivityDefaultsPatch(
    val duration: String? = null,
    val gatheringRule: String? = null,
    val invitationRule: String? = null,
    val responseDueRule: String? = null,
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC) val reminderRules: List<String>? = null
)
