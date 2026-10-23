package se.forena.api.identity.authentication

import io.swagger.v3.oas.annotations.media.Schema
import java.lang.reflect.Type
import org.springframework.core.ParameterizedTypeReference
import org.springframework.security.web.webauthn.api.AuthenticatorAssertionResponse
import org.springframework.security.web.webauthn.api.PublicKeyCredential
import org.springframework.security.web.webauthn.api.PublicKeyCredentialCreationOptions
import org.springframework.security.web.webauthn.api.PublicKeyCredentialRequestOptions
import org.springframework.security.web.webauthn.management.RelyingPartyPublicKey
import org.springframework.security.web.webauthn.registration.WebAuthnRegistrationFilter
import se.forena.api.identity.BrowserAuthAcknowledgement
import se.forena.api.identity.BrowserLoginRequest
import se.forena.api.identity.BrowserSessionView

/** Shared by filter configuration and springdoc: filter routes have no MVC method to inspect. */
object AuthenticationEndpoints {
    data class Endpoint(val path: String, val operation: String, val request: Type?, val response: Type, val form: Boolean = false)
    class TokenGenerationRequest(val username: String)
    class TokenLoginRequest(@get:Schema(accessMode = Schema.AccessMode.WRITE_ONLY) val token: String)
    class CredentialRegistrationRequest(val publicKey: RelyingPartyPublicKey)
    val login = Endpoint("/api/auth/login", "login", BrowserLoginRequest::class.java, BrowserSessionView::class.java, true)
    val logout = Endpoint("/api/auth/logout", "logout", null, BrowserAuthAcknowledgement::class.java)
    val magic = Endpoint("/api/auth/magic-link", "magicLink", TokenGenerationRequest::class.java, BrowserAuthAcknowledgement::class.java, true)
    val magicVerify = Endpoint("/api/auth/magic-link/verify", "magicVerify", TokenLoginRequest::class.java, BrowserSessionView::class.java, true)
    val passkeyOptions = Endpoint("/api/auth/passkey/options", "options", null, PublicKeyCredentialRequestOptions::class.java)
    val passkeyVerify = Endpoint("/api/auth/passkey/verify", "verifyPasskey", object : ParameterizedTypeReference<PublicKeyCredential<AuthenticatorAssertionResponse>>() {}.type, BrowserSessionView::class.java)
    val registrationOptions = Endpoint("/api/auth/passkey/registration/options", "registrationOptions", null, PublicKeyCredentialCreationOptions::class.java)
    val registrationVerify = Endpoint("/api/auth/passkey/registration/verify", "registrationVerify", CredentialRegistrationRequest::class.java, WebAuthnRegistrationFilter.SuccessfulUserRegistrationResponse::class.java)
    val all = listOf(login, logout, magic, magicVerify, passkeyOptions, passkeyVerify, registrationOptions, registrationVerify)
}
