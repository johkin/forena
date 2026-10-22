package se.forena.api.activities

import java.time.Instant
import java.util.UUID
import io.swagger.v3.oas.annotations.media.Schema

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
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val roles: List<String>
)
data class ActivityPerson(
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val id: UUID,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val name: String,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true) val invitation: AccessibleInvitation?
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
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val people: List<ActivityPerson>
)
data class PersonalOverview(
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val reference_time: Instant,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val activities: List<PersonalActivity>,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val organizations: List<PersonalOrganization>,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val teams: List<PersonalTeam>
)
