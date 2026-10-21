package se.forena.api.identity

import java.util.UUID
import com.fasterxml.jackson.annotation.JsonIgnore
import tools.jackson.databind.JsonNode
import io.swagger.v3.oas.annotations.media.Schema

// Sensitive request/token types deliberately have no generated toString().
class BrowserLoginRequest(
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED, minLength = 3, maxLength = 320) val email: String,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED, minLength = 1, maxLength = 1024, format = "password", accessMode = Schema.AccessMode.WRITE_ONLY) val password: String
)
class PasskeyVerifyRequest(
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED, format = "uuid") val challenge_id: String,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED, implementation = Map::class, additionalProperties = Schema.AdditionalPropertiesValue.TRUE) val credential: JsonNode
)
class PasskeyOptions(
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED, format = "uuid") val challenge_id: String,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED, implementation = Map::class, additionalProperties = Schema.AdditionalPropertiesValue.TRUE) val options: JsonNode,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val expires_at: Long
)
class BrowserUser(
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED, format = "uuid") val id: String,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED, types = ["string", "null"]) val email: String?
)
class BrowserSessionView(@get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val user: BrowserUser)
class BrowserSessionToken(@get:JsonIgnore val value: String, val subject: UUID)
