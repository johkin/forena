package se.forena.api.identity.authentication

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import java.time.Instant
import org.springframework.security.authentication.BadCredentialsException
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.web.webauthn.api.AttestationConveyancePreference
import org.springframework.security.web.webauthn.api.AuthenticatorSelectionCriteria
import org.springframework.security.web.webauthn.api.Bytes
import org.springframework.security.web.webauthn.api.ImmutablePublicKeyCredentialUserEntity
import org.springframework.security.web.webauthn.api.PublicKeyCredentialCreationOptions
import org.springframework.security.web.webauthn.api.PublicKeyCredentialParameters
import org.springframework.security.web.webauthn.api.PublicKeyCredentialRequestOptions
import org.springframework.security.web.webauthn.api.PublicKeyCredentialRpEntity
import org.springframework.security.web.webauthn.api.ResidentKeyRequirement
import org.springframework.security.web.webauthn.api.UserVerificationRequirement
import org.springframework.security.web.webauthn.authentication.PublicKeyCredentialRequestOptionsRepository
import org.springframework.security.web.webauthn.jackson.WebauthnJacksonModule
import org.springframework.security.web.webauthn.registration.PublicKeyCredentialCreationOptionsRepository
import tools.jackson.databind.json.JsonMapper

/** Storage adapter only. Spring filters own challenge generation, consumption and verification. */
class StringWebAuthnOptions {
    val json = JsonMapper.builder().addModule(WebauthnJacksonModule()).build()
    val requests = object : PublicKeyCredentialRequestOptionsRepository {
        override fun save(request: HttpServletRequest, response: HttpServletResponse, options: PublicKeyCredentialRequestOptions?) = save(request, false, options)
        override fun load(request: HttpServletRequest): PublicKeyCredentialRequestOptions? = load(request, false)?.let(::restoreRequestOptions)
    }
    val creations = object : PublicKeyCredentialCreationOptionsRepository {
        override fun save(request: HttpServletRequest, response: HttpServletResponse, options: PublicKeyCredentialCreationOptions?) = save(request, true, options)
        override fun load(request: HttpServletRequest): PublicKeyCredentialCreationOptions? = load(request, true)?.let(::restoreCreationOptions)
    }
    private fun save(request: HttpServletRequest, register: Boolean, options: Any?) {
        if (options == null) { request.getSession(false)?.removeAttribute(key(register)); return }
        request.getSession(true).setAttribute(key(register), "${Instant.now().epochSecond + 300}\n${if (register) SecurityContextHolder.getContext().authentication!!.name else ""}\n${json.writeValueAsString(options)}")
    }
    private fun load(request: HttpServletRequest, register: Boolean): String? {
        val state = (request.getSession(false)?.getAttribute(key(register)) as? String)?.split('\n', limit = 3) ?: return null
        val subject = if (register) SecurityContextHolder.getContext().authentication?.name else ""
        if (state.size != 3 || state[1] != subject ||
            (state[0].toLongOrNull() ?: 0) <= Instant.now().epochSecond) throw BadCredentialsException("Invalid challenge")
        return state[2]
    }
    // Spring's WebAuthn Jackson module reads browser responses, but only writes ceremony
    // options. Rebuild trusted server options explicitly rather than enabling Java or
    // polymorphic deserialization of session data.
    private fun restoreCreationOptions(serialized: String): PublicKeyCredentialCreationOptions {
        val node = json.readTree(serialized)
        require(node.path("authenticatorSelection").path("userVerification").asString() == "required")
        val user = node.path("user")
        return PublicKeyCredentialCreationOptions.builder()
            .rp(PublicKeyCredentialRpEntity.builder().id(node.path("rp").path("id").asString()).name(node.path("rp").path("name").asString()).build())
            .user(ImmutablePublicKeyCredentialUserEntity.builder().id(Bytes.fromBase64(user.path("id").asString()))
                .name(user.path("name").asString()).displayName(user.path("displayName").asString()).build())
            .challenge(Bytes.fromBase64(node.path("challenge").asString()))
            .pubKeyCredParams(PublicKeyCredentialParameters.EdDSA, PublicKeyCredentialParameters.ES256, PublicKeyCredentialParameters.RS256)
            .authenticatorSelection(AuthenticatorSelectionCriteria.builder().residentKey(ResidentKeyRequirement.REQUIRED)
                .userVerification(UserVerificationRequirement.REQUIRED).build())
            .attestation(AttestationConveyancePreference.NONE).build()
    }
    private fun restoreRequestOptions(serialized: String): PublicKeyCredentialRequestOptions {
        val node = json.readTree(serialized)
        require(node.path("userVerification").asString() == "required")
        return PublicKeyCredentialRequestOptions.builder().challenge(Bytes.fromBase64(node.path("challenge").asString()))
            .rpId(node.path("rpId").asString()).allowCredentials(emptyList()).userVerification(UserVerificationRequirement.REQUIRED).build()
    }
    private fun key(register: Boolean) = if (register) "forena.auth-webauthn-registration" else "forena.auth-webauthn-login"
}
