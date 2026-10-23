package se.forena.api.identity

import io.swagger.v3.oas.annotations.media.Schema

class BrowserUser(
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED, format = "uuid") val id: String,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED, types = ["string", "null"]) val email: String?
)
class BrowserSessionView(@get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val user: BrowserUser)
data class BrowserAuthAcknowledgement(@get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val ok: Boolean)

class BrowserLoginRequest(
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED, minLength = 3, maxLength = 320) val email: String,
    @get:Schema(requiredMode = Schema.RequiredMode.REQUIRED, minLength = 1, maxLength = 1024, format = "password", accessMode = Schema.AccessMode.WRITE_ONLY) val password: String
)

class MagicLinkRequest(@get:Schema(requiredMode = Schema.RequiredMode.REQUIRED, minLength = 3, maxLength = 320, format = "email") val email: String)
