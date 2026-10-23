package se.forena.api.identity

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty

import jakarta.servlet.http.HttpServletRequest
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication
import org.springframework.security.authentication.AuthenticationServiceException
import org.springframework.security.authentication.BadCredentialsException
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.headers.Header
import se.forena.api.http.ApiError
import io.swagger.v3.oas.annotations.Parameter
import se.forena.api.identity.internal.BrowserAuthProvider
import tools.jackson.databind.JsonNode
import java.security.MessageDigest
import java.security.SecureRandom
import java.time.Instant
import java.util.Base64
import java.util.UUID

@RestController
@ConditionalOnWebApplication
@ConditionalOnProperty(name = ["forena.auth.mode"], havingValue = "supabase", matchIfMissing = true)
class BrowserCredentialController(
    private val sessions: BrowserSessionService, private val settings: BrowserSessionSettings,
    private val provider: BrowserAuthProvider, private val limiter: BrowserLoginLimiter
) {
    @PostMapping("/api/auth/magic-link")
    @ApiResponse(responseCode = "200", description = "Request completed", useReturnTypeSchema = true)
    @ApiResponse(responseCode = "429", description = "Auth admission exhausted; no provider call. Retry later.", content = [Content(schema = Schema(implementation = ApiError::class))], headers = [Header(name = "Retry-After", schema = Schema(type = "integer", format = "int64"))])
    @Operation(operationId = "requestBrowserMagicLink", description = "Request a PKCE magic link for an existing account. Requires canonical Origin and X-Forena-Request: 1. Generic acknowledgement; no provider tokens. Limited by client, email and shared Auth budget.")
    fun magicLink(@RequestBody body: MagicLinkRequest, request: HttpServletRequest): BrowserAuthAcknowledgement {
        settings.requireEnabled()
        limiter.admit(limiter.client(request), body.email)
        if (body.email.length !in 3..320 || !body.email.matches(Regex("[^\\s@]+@[^\\s@]+\\.[^\\s@]+")))
            throw IllegalArgumentException("Invalid email")
        val verifier = Base64.getUrlEncoder().withoutPadding().encodeToString(ByteArray(32).also { SecureRandom().nextBytes(it) })
        val challenge = Base64.getUrlEncoder().withoutPadding().encodeToString(MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray(Charsets.US_ASCII)))
        val session = request.getSession(true)
        session.setAttribute(MAGIC_LINK, settings.encrypt("$verifier\n${Instant.now().epochSecond + 600}", session.id))
        try {
            provider.magicLink(body.email, challenge, "${settings.origin}/auth/callback")
        } catch (_: BadCredentialsException) {
            // Unknown accounts must not be distinguishable. No automatic signup.
        }
        return BrowserAuthAcknowledgement(true)
    }

    @PostMapping("/api/auth/magic-link/verify")
    @ApiResponse(responseCode = "200", description = "Request completed", useReturnTypeSchema = true)
    @ApiResponse(responseCode = "429", description = "Auth admission exhausted; no provider call. Retry later.", content = [Content(schema = Schema(implementation = ApiError::class))], headers = [Header(name = "Retry-After", schema = Schema(type = "integer", format = "int64"))])
    @Operation(operationId = "verifyBrowserMagicLink", description = "Exchange a one-time code with the encrypted PKCE verifier in the initiating HttpOnly session. Requires canonical Origin and X-Forena-Request: 1. Rotates session; returns verified user information only.")
    fun verifyMagicLink(@RequestBody body: MagicLinkVerifyRequest, request: HttpServletRequest): BrowserSessionView {
        settings.requireEnabled()
        limiter.admit(limiter.client(request))
        if (body.code.length !in 1..2048 || body.code.any { it.isWhitespace() }) throw BadCredentialsException("Session verification failed")
        return sessions.magicLinkVerify(body.code, request)
    }

    @PostMapping("/api/auth/passkey/registration/options")
    @ApiResponse(responseCode = "200", description = "Request completed", useReturnTypeSchema = true)
    @ApiResponse(responseCode = "429", description = "Auth admission exhausted; no provider call. Retry later.", content = [Content(schema = Schema(implementation = ApiError::class))], headers = [Header(name = "Retry-After", schema = Schema(type = "integer", format = "int64"))])
    @Operation(operationId = "startBrowserPasskeyRegistration", description = "Authenticated WebAuthn enrollment. Requires canonical Origin, X-Forena-Request: 1 and a browser session. Challenge bound to session and verified account for at most five minutes.")
    fun registrationOptions(@Parameter(hidden = true) @AuthenticationPrincipal jwt: Jwt, request: HttpServletRequest): PasskeyOptions {
        settings.requireEnabled()
        limiter.admit(limiter.client(request))
        val session = request.getSession(false) ?: throw BadCredentialsException("Session verification failed")
        sessions.current(jwt.tokenValue)
        val result = provider.registrationOptions(jwt.tokenValue)
        val id = result.get("challenge_id")?.asString() ?: throw AuthenticationServiceException("Session verification failed")
        if (runCatching { UUID.fromString(id).toString() == id }.getOrDefault(false).not()) throw AuthenticationServiceException("Session verification failed")
        val expires = minOf(result.get("expires_at")?.asLong() ?: throw AuthenticationServiceException("Session verification failed"), Instant.now().epochSecond + 300)
        val options = result.get("options")?.takeIf { it.isObject } ?: throw AuthenticationServiceException("Session verification failed")
        session.setAttribute(REGISTRATION, "$id\n$expires\n${jwt.subject}")
        return PasskeyOptions(id, options, expires)
    }

    @PostMapping("/api/auth/passkey/registration/verify")
    @ApiResponse(responseCode = "200", description = "Request completed", useReturnTypeSchema = true)
    @ApiResponse(responseCode = "429", description = "Auth admission exhausted; no provider call. Retry later.", content = [Content(schema = Schema(implementation = ApiError::class))], headers = [Header(name = "Retry-After", schema = Schema(type = "integer", format = "int64"))])
    @Operation(operationId = "verifyBrowserPasskeyRegistration", description = "Verify account/session-bound enrollment via Auth. Requires canonical Origin, X-Forena-Request: 1 and a browser session. Never returns provider tokens.")
    fun registrationVerify(@Parameter(hidden = true) @AuthenticationPrincipal jwt: Jwt, @RequestBody body: PasskeyVerifyRequest, request: HttpServletRequest): BrowserAuthAcknowledgement {
        settings.requireEnabled()
        limiter.admit(limiter.client(request))
        val session = request.getSession(false) ?: throw BadCredentialsException("Session verification failed")
        val challenge = session.getAttribute(REGISTRATION) as? String ?: throw BadCredentialsException("Session verification failed")
        val parts = challenge.split('\n')
        if (parts.size != 3 || parts[0] != body.challenge_id || parts[2] != jwt.subject ||
            (parts[1].toLongOrNull() ?: 0) <= Instant.now().epochSecond || !body.credential.isObject || body.credential.toString().length > 16384)
            throw BadCredentialsException("Session verification failed")
        session.removeAttribute(REGISTRATION)
        sessions.current(jwt.tokenValue)
        provider.registrationVerify(jwt.tokenValue, body.challenge_id, body.credential)
        return BrowserAuthAcknowledgement(true)
    }

    companion object {
        const val MAGIC_LINK = "forena.magic-link-pkce"
        const val REGISTRATION = "forena.passkey-registration"
    }
}
