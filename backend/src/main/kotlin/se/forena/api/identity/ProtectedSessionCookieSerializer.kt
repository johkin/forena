package se.forena.api.identity

import org.springframework.security.authentication.BadCredentialsException
import jakarta.servlet.http.HttpServletRequest
import org.springframework.session.web.http.CookieSerializer

/** Keep a database-only session ID from being usable as a browser credential. */
class ProtectedSessionCookieSerializer(
    private val delegate: CookieSerializer, private val settings: BrowserSessionSettings
) : CookieSerializer {
    override fun readCookieValues(request: HttpServletRequest): List<String> =
        delegate.readCookieValues(request).mapNotNull { value ->
            try { settings.decrypt(value, CONTEXT) } catch (_: BadCredentialsException) { null }
        }

    override fun writeCookieValue(value: CookieSerializer.CookieValue) {
        val protected = if (value.cookieValue.isEmpty()) "" else settings.encrypt(value.cookieValue, CONTEXT)
        delegate.writeCookieValue(CookieSerializer.CookieValue(value.request, value.response, protected).apply {
            cookieMaxAge = value.cookieMaxAge
        })
    }

    companion object { private const val CONTEXT = "spring-session-cookie" }
}
