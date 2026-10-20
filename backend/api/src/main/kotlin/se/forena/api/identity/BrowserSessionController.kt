package se.forena.api.identity

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.session.web.http.HttpSessionIdResolver
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import tools.jackson.databind.JsonNode
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.headers.Header
import se.forena.api.http.ApiError

@RestController
@ConditionalOnWebApplication
class BrowserSessionController(private val sessions: BrowserSessionService, private val settings: BrowserSessionSettings,
                               private val limiter: BrowserLoginLimiter, private val sessionIds: HttpSessionIdResolver) {
    @GetMapping("/api/auth/session")
    @Operation(operationId = "getBrowserSession", description = "Verified user information only. Requires the HttpOnly browser session cookie or an existing valid Bearer token. Cache-Control: no-store.")
    fun session(@Parameter(hidden = true) @AuthenticationPrincipal jwt: Jwt) = sessions.current(jwt.tokenValue)

    @PostMapping("/api/auth/login")
    @ApiResponse(responseCode = "200", description = "Browser session created", useReturnTypeSchema = true)
    @ApiResponse(responseCode = "429", description = "Login admission exhausted; no provider call. Retry later.", content = [Content(schema = Schema(implementation = ApiError::class))], headers = [Header(name = "Retry-After", schema = Schema(type = "integer", format = "int64"))])
    @Operation(operationId = "loginBrowserSession", description = "Password sign-in. Requires the canonical Origin and X-Forena-Request: 1. Sets an opaque HttpOnly session cookie; never returns provider tokens.")
    fun login(@RequestBody body: BrowserLoginRequest, request: HttpServletRequest): BrowserSessionView {
        limiter.admit(limiter.client(request), body.email)
        return sessions.login(body.email, body.password, request)
    }

    @PostMapping("/api/auth/logout")
    @Operation(operationId = "logoutBrowserSession", description = "Idempotent local logout. Requires the canonical Origin and X-Forena-Request: 1. Deletes the server session before contacting Auth.")
    fun logout(request: HttpServletRequest, response: HttpServletResponse): Map<String, Boolean> {
        settings.requireEnabled()
        sessions.logout(request)
        sessionIds.expireSession(request, response)
        return mapOf("ok" to true)
    }

    @PostMapping("/api/auth/passkey/options")
    @ApiResponse(responseCode = "200", description = "Browser-bound passkey options", useReturnTypeSchema = true)
    @ApiResponse(responseCode = "429", description = "Login admission exhausted; no provider call. Retry later.", content = [Content(schema = Schema(implementation = ApiError::class))], headers = [Header(name = "Retry-After", schema = Schema(type = "integer", format = "int64"))])
    @Operation(operationId = "startBrowserPasskey", description = "Begin WebAuthn authentication. Requires the canonical Origin and X-Forena-Request: 1. Binds the challenge to the HttpOnly Spring session for at most five minutes.")
    fun options(request: HttpServletRequest): PasskeyOptions {
        limiter.admit(limiter.client(request))
        val result = sessions.passkeyOptions()
        val id = result.get("challenge_id")?.asString() ?: throw SessionVerificationUnavailable()
        validateChallengeId(id)
        val expires = minOf(result.get("expires_at")?.asLong() ?: throw SessionVerificationUnavailable(), java.time.Instant.now().epochSecond + 300)
        request.getSession(true).setAttribute("forena.passkey-challenge", "$id\n$expires")
        return PasskeyOptions(id, result.get("options") ?: throw SessionVerificationUnavailable(), expires)
    }

    @PostMapping("/api/auth/passkey/verify")
    @ApiResponse(responseCode = "200", description = "Browser session created", useReturnTypeSchema = true)
    @ApiResponse(responseCode = "429", description = "Login admission exhausted; no provider call. Retry later.", content = [Content(schema = Schema(implementation = ApiError::class))], headers = [Header(name = "Retry-After", schema = Schema(type = "integer", format = "int64"))])
    @Operation(operationId = "verifyBrowserPasskey", description = "Verify the browser-bound WebAuthn challenge via Auth and set an HttpOnly session cookie. Requires the canonical Origin and X-Forena-Request: 1. Never returns provider tokens.")
    fun verify(@RequestBody body: PasskeyVerifyRequest, request: HttpServletRequest): BrowserSessionView {
        settings.requireEnabled()
        limiter.admit(limiter.client(request))
        val challenge = request.getSession(false)?.getAttribute("forena.passkey-challenge") as? String ?: throw InactiveSession()
        val parts = challenge.split('\n')
        if (parts.size != 2 || parts[0] != body.challenge_id || (parts[1].toLongOrNull() ?: 0) <= java.time.Instant.now().epochSecond ||
            !body.credential.isObject || body.credential.toString().length > 16384) throw InactiveSession()
        request.getSession(false)?.removeAttribute("forena.passkey-challenge")
        return sessions.passkeyVerify(body.challenge_id, body.credential, request)
    }

    private fun validateChallengeId(value: String) { if (runCatching { java.util.UUID.fromString(value).toString() == value }.getOrDefault(false).not()) throw SessionVerificationUnavailable() }
}
