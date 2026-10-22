package se.forena.api.identity.nativeauth

import jakarta.servlet.http.HttpServletRequest
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.security.authentication.BadCredentialsException
import org.springframework.security.core.Authentication
import org.springframework.security.web.webauthn.api.*
import org.springframework.security.web.webauthn.jackson.WebauthnJacksonModule
import org.springframework.security.web.webauthn.management.*
import org.springframework.stereotype.Service
import se.forena.api.identity.PasskeyOptions
import se.forena.api.identity.PasskeyVerifyRequest
import tools.jackson.core.type.TypeReference
import tools.jackson.databind.json.JsonMapper
import java.time.Instant
import java.util.UUID

/** Spring Security/WebAuthn4J performs all cryptographic validation; sessions contain JSON strings only. */
@Service
@ConditionalOnProperty(name = ["forena.auth.mode"], havingValue = "native")
class NativePasskeyService(private val relyingParty: WebAuthnRelyingPartyOperations, private val accounts: NativeAccountService) {
    private val json = JsonMapper.builder().addModule(WebauthnJacksonModule()).build()
    fun options(authentication: Authentication?, register: Boolean, request: HttpServletRequest): PasskeyOptions {
        if (register) accounts.requireUser(UUID.fromString(authentication!!.name))
        val options = if (register) relyingParty.createPublicKeyCredentialCreationOptions(object : PublicKeyCredentialCreationOptionsRequest {
            override fun getAuthentication() = authentication!!
        }) else relyingParty.createCredentialRequestOptions(object : PublicKeyCredentialRequestOptionsRequest {
            override fun getAuthentication() = authentication
        })
        val id = UUID.randomUUID().toString()
        val expires = Instant.now().epochSecond + 300
        val serialized = json.writeValueAsString(options)
        request.getSession(true).setAttribute(key(register), "$id\n$expires\n${if (register) authentication!!.name else ""}\n$serialized")
        return PasskeyOptions(id, json.readTree(serialized), expires)
    }
    fun register(authentication: Authentication, body: PasskeyVerifyRequest, request: HttpServletRequest) {
        accounts.requireUser(UUID.fromString(authentication.name))
        val state = consume(body, true, authentication.name, request)
        try {
            val options = restoreCreationOptions(state)
            require(options.authenticatorSelection.userVerification == UserVerificationRequirement.REQUIRED)
            val credential = json.readValue(body.credential.toString(), object : TypeReference<PublicKeyCredential<AuthenticatorAttestationResponse>>() {})
            relyingParty.registerCredential(object : RelyingPartyRegistrationRequest {
                override fun getCreationOptions() = options
                override fun getPublicKey() = RelyingPartyPublicKey(credential, "Passkey")
            })
        } catch (error: Exception) { org.slf4j.LoggerFactory.getLogger(NativePasskeyService::class.java).warn("native_passkey_failed cause={}", error.javaClass.simpleName); throw BadCredentialsException("Passkey verification failed") }
    }
    fun authenticate(body: PasskeyVerifyRequest, request: HttpServletRequest): UUID {
        val state = consume(body, false, "", request)
        return try {
            val options = restoreRequestOptions(state)
            require(options.userVerification == UserVerificationRequirement.REQUIRED)
            val credential = json.readValue(body.credential.toString(), object : TypeReference<PublicKeyCredential<AuthenticatorAssertionResponse>>() {})
            UUID.fromString(relyingParty.authenticate(RelyingPartyAuthenticationRequest(options, credential)).name)
        } catch (error: Exception) { org.slf4j.LoggerFactory.getLogger(NativePasskeyService::class.java).warn("native_passkey_failed cause={}", error.javaClass.simpleName); throw BadCredentialsException("Passkey verification failed") }
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
    private fun consume(body: PasskeyVerifyRequest, register: Boolean, subject: String, request: HttpServletRequest): String {
        val session = request.getSession(false) ?: run { org.slf4j.LoggerFactory.getLogger(NativePasskeyService::class.java).warn("native_passkey_failed reason=missing_session"); throw BadCredentialsException("Missing challenge") }
        val state = (session.getAttribute(key(register)) as? String)?.split('\n', limit = 4) ?: run {
            org.slf4j.LoggerFactory.getLogger(NativePasskeyService::class.java).warn("native_passkey_failed reason=missing_challenge")
            throw BadCredentialsException("Missing challenge")
        }
        if (state.size != 4 || state[0] != body.challenge_id || state[2] != subject || (state[1].toLongOrNull() ?: 0) <= Instant.now().epochSecond ||
            !body.credential.isObject || body.credential.toString().length > 16384) {
            org.slf4j.LoggerFactory.getLogger(NativePasskeyService::class.java).warn("native_passkey_failed reason=invalid_challenge")
            throw BadCredentialsException("Invalid challenge")
        }
        session.removeAttribute(key(register))
        return state[3]
    }
    private fun key(register: Boolean) = if (register) "forena.native-webauthn-registration" else "forena.native-webauthn-login"
}
