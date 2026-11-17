package se.forena.api.identity.authentication

import se.forena.api.identity.AccountLifecycleService
import java.time.Instant
import org.springframework.security.authentication.BadCredentialsException
import org.springframework.security.oauth2.server.resource.introspection.OAuth2IntrospectionException
import org.springframework.security.oauth2.server.resource.introspection.OpaqueTokenIntrospector
import org.springframework.session.Session
import org.springframework.session.SessionRepository
import org.springframework.session.jdbc.JdbcIndexedSessionRepository
import org.springframework.stereotype.Service
import se.forena.api.identity.Actor
import se.forena.api.identity.BrowserSessionSettings

@Service
class SessionVerifier(private val accounts: AccountService, sessions: JdbcIndexedSessionRepository,
                            private val introspector: OpaqueTokenIntrospector, private val settings: BrowserSessionSettings, private val lifecycle: AccountLifecycleService) {
    @Suppress("UNCHECKED_CAST")
    private val sessions = sessions as SessionRepository<Session>
    fun requireActive(actor: Actor) {
        val user = accounts.requireUser(actor.subject)
        if (actor.bearerToken.isEmpty()) {
            val session = sessions.findById(actor.session.toString()) ?: throw BadCredentialsException("Inactive session")
            if (session.getAttribute<String>(AccountSecurityContextRepository.IDENTITY) != "${user.subject}\n${user.authVersion}" ||
                session.creationTime.plusSeconds(settings.maxSeconds).isBefore(Instant.now())) throw BadCredentialsException("Inactive session")
        } else {
            lifecycle.requireBusinessAccess(actor.subject)
            val principal = try { introspector.introspect(actor.bearerToken) }
                catch (_: OAuth2IntrospectionException) { throw BadCredentialsException("Inactive grant") }
            if (principal.name != actor.subject.toString() || principal.getAttribute<String>("grant_id") != actor.session.toString()) throw BadCredentialsException("Inactive grant")
        }
    }
}
