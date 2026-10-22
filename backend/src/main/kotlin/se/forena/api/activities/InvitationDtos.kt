package se.forena.api.activities

import com.fasterxml.jackson.annotation.JsonIgnore
import com.fasterxml.jackson.annotation.JsonValue
import java.util.UUID
import io.swagger.v3.oas.annotations.media.Schema
import tools.jackson.databind.annotation.JsonSerialize
import tools.jackson.databind.annotation.JsonDeserialize

enum class InvitationResponse(@get:JsonValue val value: String) {
    PENDING("pending"), ACCEPTED("accepted"), DECLINED("declined");

    companion object {
        fun fromDatabase(value: String): InvitationResponse = entries.single { it.value == value }
    }
}

@Schema(additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
data class RespondToInvitationRequest(
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val response: InvitationResponse
) {
    @field:JsonDeserialize(using = StrictCommentDeserializer::class)
    @get:Schema(
        description = "Omitted preserves the comment; null or blank clears it. Trimmed and truncated to 500 Unicode code points. Pending always clears it.",
        types = ["string", "null"], requiredMode = Schema.RequiredMode.NOT_REQUIRED
    )
    var comment: String? = null
        set(value) {
            field = value
            commentProvided = true
        }

    @get:JsonIgnore
    @get:Schema(hidden = true)
    var commentProvided: Boolean = false
        private set
}

data class InvitationResponseResult(@get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val ok: Boolean = true)

data class AccessibleInvitation(
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val id: UUID,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val person_id: UUID,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val response: InvitationResponse,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED, types = ["string", "null"]) val response_comment: String?,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val name: String
)
data class MyInvitations(
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC)
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val invitations: List<AccessibleInvitation>
)
data class ResponseChange(val response: String, val commentProvided: Boolean, val comment: String?)
