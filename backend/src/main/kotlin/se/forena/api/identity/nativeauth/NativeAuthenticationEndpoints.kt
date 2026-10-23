package se.forena.api.identity.nativeauth

import se.forena.api.identity.*
import org.springframework.security.web.webauthn.api.*
import org.springframework.security.web.webauthn.registration.WebAuthnRegistrationFilter
import org.springframework.security.web.webauthn.management.RelyingPartyPublicKey
import org.springframework.core.ParameterizedTypeReference

/** Shared by filter configuration and springdoc: filter routes have no MVC method to inspect. */
object NativeAuthenticationEndpoints {
    data class Endpoint(val path: String, val operation: String, val request: java.lang.reflect.Type?, val response: java.lang.reflect.Type, val form: Boolean = false)
    class TokenGenerationRequest(val username: String)
    class TokenLoginRequest(@get:io.swagger.v3.oas.annotations.media.Schema(accessMode = io.swagger.v3.oas.annotations.media.Schema.AccessMode.WRITE_ONLY) val token: String)
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
