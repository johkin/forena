package se.forena.api.activities

import java.time.Instant
import java.util.UUID
import io.swagger.v3.oas.annotations.media.Schema
import tools.jackson.databind.annotation.JsonSerialize

data class MyActivity(
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val id: UUID,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val title: String,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val starts_at: Instant,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val ends_at: Instant,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val organization_name: String,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val team_name: String,
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC)
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val invitations: List<AccessibleInvitation>
)

data class MyActivities(
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC)
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val activities: List<MyActivity>,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED, types = ["integer", "null"]) val next_offset: Int?
)
