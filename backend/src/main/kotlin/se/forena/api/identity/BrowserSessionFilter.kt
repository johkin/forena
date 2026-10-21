package se.forena.api.identity

import org.springframework.security.authentication.AuthenticationServiceException
import org.springframework.security.oauth2.core.OAuth2AuthenticationException
import org.springframework.security.authentication.BadCredentialsException
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.web.filter.OncePerRequestFilter
import org.springframework.dao.DataAccessException
import org.springframework.security.oauth2.jwt.JwtException
import se.forena.api.http.ApiError
import tools.jackson.databind.json.JsonMapper

/** This filter is installed only in Spring Security, never as a second servlet filter. */
class BrowserSessionFilter(
    private val settings: BrowserSessionSettings, private val sessions: BrowserSessionService,
    private val json: JsonMapper
) : OncePerRequestFilter() {
    override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain) {
        if (!request.requestURI.startsWith("/api/")) { chain.doFilter(request, response); return }
        response.setHeader("Cache-Control", "no-store")
        response.setHeader("Pragma", "no-cache")
        val authRoute = request.requestURI.startsWith("/api/auth/")
        val cookie = sessionCookie(request, settings.cookieName)
        if (request.method !in listOf("GET", "HEAD", "OPTIONS") && (authRoute || cookie != null)) {
            if (!settings.enabled || request.getHeader("Origin") != settings.origin || request.getHeader("X-Forena-Request") != "1") {
                fail(response, 403, "Begäran är inte tillåten."); return
            }
        }
        // Login/logout must also work with an expired or revoked previous cookie.
        val publicAuth = request.requestURI in setOf("/api/auth/login", "/api/auth/logout", "/api/auth/passkey/options", "/api/auth/passkey/verify")
        if (cookie != null && !publicAuth && settings.enabled) {
            if (!request.getHeader("Authorization").isNullOrBlank()) {
                fail(response, 400, "Tvetydig autentisering."); return
            }
            try {
                if (cookie == "invalid") { fail(response, 401, "Inloggning krävs."); return }
                val token = sessions.resolve(request)
                if (token == null) { fail(response, 401, "Inloggning krävs."); return }
                val expectedAccount = request.getHeader("X-Forena-Account")
                if ((!authRoute && request.method !in listOf("GET", "HEAD", "OPTIONS") && expectedAccount == null) ||
                    (expectedAccount != null && expectedAccount != token.subject.toString())) {
                    fail(response, 401, "Sessionen är inte aktiv."); return
                }
                request.setAttribute(TOKEN_ATTRIBUTE, token.value)
            } catch (_: BadCredentialsException) { fail(response, 401, "Sessionen är inte aktiv."); return }
            catch (_: JwtException) { fail(response, 401, "Sessionen är inte aktiv."); return }
            catch (error: OAuth2AuthenticationException) {
                if (error.error.errorCode == "temporarily_unavailable") fail(response, 503, "Sessionen kan inte verifieras just nu.")
                else fail(response, 401, "Sessionen är inte aktiv.")
                return
            }
            catch (_: AuthenticationServiceException) { fail(response, 503, "Sessionen kan inte verifieras just nu."); return }
            catch (_: DataAccessException) { fail(response, 503, "Sessionen kan inte verifieras just nu."); return }
        }
        chain.doFilter(request, response)
    }
    private fun fail(response: HttpServletResponse, status: Int, message: String) {
        response.status = status; response.contentType = "application/json"
        json.writeValue(response.outputStream, ApiError(message))
    }
    companion object { const val TOKEN_ATTRIBUTE = "forena.web-session-token" }
}

internal fun sessionCookie(request: HttpServletRequest, name: String): String? {
    val cookies = request.cookies?.filter { it.name == name } ?: return null
    // Duplicate cookies are ambiguous: supply an invalid id, never pick an attacker-controlled one.
    return if (cookies.size > 1) "invalid" else cookies.singleOrNull()?.value
}
