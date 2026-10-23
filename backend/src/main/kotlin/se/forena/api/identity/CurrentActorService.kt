package se.forena.api.identity

import jakarta.servlet.http.HttpServletRequest
import org.springframework.security.core.Authentication
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.authentication.BadCredentialsException
import org.springframework.stereotype.Service
import java.util.UUID

/** Business controllers accept a verified identity, independently of the login provider. */
@Service
class CurrentActorService(@org.springframework.beans.factory.annotation.Value("\${forena.auth.mode:supabase}") mode: String) {
    init { require(mode in setOf("native", "supabase")) { "Unknown authentication mode" } }
    fun from(authentication: Authentication, request: HttpServletRequest): Actor {
        val jwt = authentication.principal as? Jwt
        if (jwt != null) return Actor(UUID.fromString(jwt.subject), UUID.fromString(jwt.getClaimAsString("session_id")), jwt.tokenValue)
        if (!authentication.isAuthenticated) throw BadCredentialsException("Inactive session")
        val session = request.getSession(false) ?: throw BadCredentialsException("Inactive session")
        return Actor(UUID.fromString(authentication.name), UUID.fromString(session.id), "")
    }
}
