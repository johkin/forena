package se.forena.api.identity

import org.springframework.security.authentication.BadCredentialsException
import org.springframework.stereotype.Service
import se.forena.api.identity.authentication.SessionVerifier
import se.forena.api.identity.internal.AccountRepository
import se.forena.api.identity.internal.RevokedSessionRepository

@Service
class SessionService(private val accounts: AccountRepository, private val revocations: RevokedSessionRepository,
                     private val verifier: SessionVerifier) {
    fun requireActive(actor: Actor) {
        if (!accounts.existsBySubjectAndEnabledTrue(actor.subject) ||
            revocations.existsByIdAndSubject(actor.session, actor.subject)) throw BadCredentialsException("Session verification failed")
        verifier.requireActive(actor)
    }
}
