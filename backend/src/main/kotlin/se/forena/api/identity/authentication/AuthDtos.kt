package se.forena.api.identity.authentication

import io.swagger.v3.oas.annotations.media.Schema

class RegisterRequest(val email: String, @get:Schema(accessMode = Schema.AccessMode.WRITE_ONLY) val password: String)
class CodeRequest(@get:Schema(accessMode = Schema.AccessMode.WRITE_ONLY) val code: String)
class ResetRequest(@get:Schema(accessMode = Schema.AccessMode.WRITE_ONLY) val code: String,
                         @get:Schema(accessMode = Schema.AccessMode.WRITE_ONLY) val password: String)
data class PasskeyView(val id: String, val label: String)

data class ConsentView(val clientId: String, val clientName: String, val state: String, val scope: String,
                             val resource: String, val csrfParameter: String, val csrfToken: String)
