package se.forena.api.identity

import jakarta.servlet.http.HttpServletRequest
import java.util.UUID
import org.springframework.security.authentication.BadCredentialsException
import org.springframework.security.core.Authentication
import org.springframework.stereotype.Service

/** Business controllers accept a verified identity, independently of the login provider. */
@Service
class CurrentActorService {
    fun from(authentication: Authentication, request: HttpServletRequest): Actor {
        if (!authentication.isAuthenticated) throw BadCredentialsException("Inactive session")
        val session = request.getSession(false) ?: throw BadCredentialsException("Inactive session")
        return Actor(UUID.fromString(authentication.name), UUID.fromString(session.id), "")
    }
}
