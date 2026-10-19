package se.forena.api.participation

import com.fasterxml.jackson.annotation.JsonIgnore
import com.fasterxml.jackson.annotation.JsonValue
import io.swagger.v3.oas.annotations.media.Schema
import tools.jackson.core.JsonParser
import tools.jackson.core.JsonToken
import tools.jackson.databind.DeserializationContext
import tools.jackson.databind.ValueDeserializer
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

/** Jackson must not coerce JSON numbers/booleans into comment text. */
class StrictCommentDeserializer : ValueDeserializer<String>() {
    override fun deserialize(parser: JsonParser, context: DeserializationContext): String =
        if (parser.currentToken() == JsonToken.VALUE_STRING) parser.string
        else context.reportInputMismatch(String::class.java, "Comment must be a string or null")
}

data class InvitationResponseResult(@get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val ok: Boolean = true)
