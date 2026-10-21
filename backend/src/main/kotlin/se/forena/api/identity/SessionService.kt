package se.forena.api.identity

import org.springframework.stereotype.Service
import se.forena.api.identity.internal.AccountRepository
import se.forena.api.identity.internal.RevokedSessionRepository

@Service
class SessionService(private val accounts: AccountRepository, private val revocations: RevokedSessionRepository,
                     private val provider: ProviderSessionVerifier) {
    fun requireActive(actor: Actor) {
        if (!accounts.existsBySubjectAndEnabledTrue(actor.subject) ||
            revocations.existsByIdAndSubject(actor.session, actor.subject)) throw InactiveSession()
        provider.requireActive(actor)
    }
}
