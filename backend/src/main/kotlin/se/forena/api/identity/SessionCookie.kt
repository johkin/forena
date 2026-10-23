package se.forena.api.identity

import jakarta.servlet.http.HttpServletRequest

internal fun sessionCookie(request: HttpServletRequest, name: String): String? {
    val cookies = request.cookies?.filter { it.name == name } ?: return null
    // Duplicate cookies are ambiguous: supply an invalid id, never pick an attacker-controlled one.
    return if (cookies.size > 1) "invalid" else cookies.singleOrNull()?.value
}
