package se.forena.api.identity.nativeauth

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.security.authentication.BadCredentialsException
import org.springframework.security.oauth2.server.resource.introspection.OpaqueTokenIntrospector
import org.springframework.security.oauth2.server.resource.introspection.OAuth2IntrospectionException
import org.springframework.session.jdbc.JdbcIndexedSessionRepository
import org.springframework.stereotype.Service
import se.forena.api.identity.Actor
import se.forena.api.identity.BrowserSessionSettings
import se.forena.api.identity.ProviderSessionVerifier
import java.time.Instant

@Service
@ConditionalOnProperty(name = ["forena.auth.mode"], havingValue = "native")
class NativeSessionVerifier(private val accounts: NativeAccountService, sessions: JdbcIndexedSessionRepository,
                            private val introspector: OpaqueTokenIntrospector, private val settings: BrowserSessionSettings) : ProviderSessionVerifier {
    @Suppress("UNCHECKED_CAST")
    private val sessions = sessions as org.springframework.session.SessionRepository<org.springframework.session.Session>
    override fun requireActive(actor: Actor) {
        val user = accounts.requireUser(actor.subject)
        if (actor.bearerToken.isEmpty()) {
            val session = sessions.findById(actor.session.toString()) ?: throw BadCredentialsException("Inactive session")
            if (session.getAttribute<String>(NativeSessionRepository.IDENTITY) != "${user.subject}\n${user.authVersion}" ||
                session.creationTime.plusSeconds(settings.maxSeconds).isBefore(Instant.now())) throw BadCredentialsException("Inactive session")
        } else {
            val principal = try { introspector.introspect(actor.bearerToken) }
                catch (_: OAuth2IntrospectionException) { throw BadCredentialsException("Inactive grant") }
            if (principal.name != actor.subject.toString() || principal.getAttribute<String>("grant_id") != actor.session.toString()) throw BadCredentialsException("Inactive grant")
        }
    }
}
