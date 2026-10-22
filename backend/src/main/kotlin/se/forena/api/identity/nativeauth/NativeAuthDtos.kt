package se.forena.api.identity.nativeauth

import io.swagger.v3.oas.annotations.media.Schema

class NativeRegisterRequest(val email: String, @get:Schema(accessMode = Schema.AccessMode.WRITE_ONLY) val password: String)
class NativeCodeRequest(@get:Schema(accessMode = Schema.AccessMode.WRITE_ONLY) val code: String)
class NativeResetRequest(@get:Schema(accessMode = Schema.AccessMode.WRITE_ONLY) val code: String,
                         @get:Schema(accessMode = Schema.AccessMode.WRITE_ONLY) val password: String)
data class NativePasskeyView(val id: String, val label: String)

data class NativeConsentView(val clientId: String, val clientName: String, val state: String, val scope: String,
                             val resource: String, val csrfParameter: String, val csrfToken: String)
