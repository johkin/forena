package se.forena.api.identity

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import java.time.Instant
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication
import org.springframework.http.HttpHeaders
import org.springframework.http.ResponseCookie
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import tools.jackson.databind.JsonNode
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter

@RestController
@ConditionalOnWebApplication
class BrowserSessionController(private val sessions: BrowserSessionService, private val settings: BrowserSessionSettings) {
    @GetMapping("/api/auth/session")
    @Operation(operationId = "getBrowserSession", description = "Verified user information only. Requires the HttpOnly browser session cookie or an existing valid Bearer token. Cache-Control: no-store.")
    fun session(@Parameter(hidden = true) @AuthenticationPrincipal jwt: Jwt) = sessions.current(jwt.tokenValue)

    @PostMapping("/api/auth/login")
    @Operation(operationId = "loginBrowserSession", description = "Password sign-in. Requires the canonical Origin and X-Forena-Request: 1. Sets an opaque HttpOnly session cookie; never returns provider tokens.")
    fun login(@RequestBody body: BrowserLoginRequest, request: HttpServletRequest, response: HttpServletResponse): BrowserSessionView {
        val id = sessions.login(body.email, body.password, sessionCookie(request, settings.cookieName))
        cookie(response, settings.cookieName, id)
        return sessions.current(sessions.resolve(id)?.value ?: throw InactiveSession())
    }

    @PostMapping("/api/auth/logout")
    @Operation(operationId = "logoutBrowserSession", description = "Idempotent local logout. Requires the canonical Origin and X-Forena-Request: 1. Deletes the server session before contacting Auth.")
    fun logout(request: HttpServletRequest, response: HttpServletResponse): Map<String, Boolean> {
        settings.requireEnabled()
        sessions.logout(sessionCookie(request, settings.cookieName))
        cookie(response, settings.cookieName, "", 0)
        cookie(response, settings.challengeCookieName, "", 0)
        return mapOf("ok" to true)
    }

    @PostMapping("/api/auth/passkey/options")
    @Operation(operationId = "startBrowserPasskey", description = "Begin WebAuthn authentication. Requires the canonical Origin and X-Forena-Request: 1. Binds the challenge to an encrypted HttpOnly cookie.")
    fun options(response: HttpServletResponse): PasskeyOptions {
        val result = sessions.passkeyOptions()
        val id = result.get("challenge_id")?.asString() ?: throw SessionVerificationUnavailable()
        validateChallengeId(id)
        val expires = minOf(result.get("expires_at")?.asLong() ?: throw SessionVerificationUnavailable(), Instant.now().epochSecond + 300)
        cookie(response, settings.challengeCookieName, settings.encrypt("$id\n$expires", "passkey"), 300)
        return PasskeyOptions(id, result.get("options") ?: throw SessionVerificationUnavailable(), expires)
    }

    @PostMapping("/api/auth/passkey/verify")
    @Operation(operationId = "verifyBrowserPasskey", description = "Verify the browser-bound WebAuthn challenge via Auth and set an HttpOnly session cookie. Requires the canonical Origin and X-Forena-Request: 1. Never returns provider tokens.")
    fun verify(@RequestBody body: PasskeyVerifyRequest, request: HttpServletRequest, response: HttpServletResponse): BrowserSessionView {
        settings.requireEnabled()
        val challenge = sessionCookie(request, settings.challengeCookieName) ?: throw InactiveSession()
        val parts = settings.decrypt(challenge, "passkey").split('\n')
        if (parts.size != 2 || parts[0] != body.challenge_id || (parts[1].toLongOrNull() ?: 0) <= Instant.now().epochSecond ||
            !body.credential.isObject || body.credential.toString().length > 16384) throw InactiveSession()
        cookie(response, settings.challengeCookieName, "", 0)
        val id = sessions.passkeyVerify(body.challenge_id, body.credential, sessionCookie(request, settings.cookieName))
        cookie(response, settings.cookieName, id)
        return sessions.current(sessions.resolve(id)?.value ?: throw InactiveSession())
    }

    private fun cookie(response: HttpServletResponse, name: String, value: String, maxAge: Long? = null) {
        val builder = ResponseCookie.from(name, value).httpOnly(true).secure(settings.secure).sameSite("Lax").path("/")
        if (maxAge != null) builder.maxAge(maxAge)
        response.addHeader(HttpHeaders.SET_COOKIE, builder.build().toString())
    }
    private fun validateChallengeId(value: String) { if (runCatching { java.util.UUID.fromString(value).toString() == value }.getOrDefault(false).not()) throw SessionVerificationUnavailable() }
}
