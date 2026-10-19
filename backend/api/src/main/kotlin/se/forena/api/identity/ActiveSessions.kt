package se.forena.api.identity

import java.util.UUID
import org.springframework.stereotype.Service
import se.forena.api.identity.internal.AccountRepository
import se.forena.api.identity.internal.RevokedSessionRepository

data class Actor(val subject: UUID, val session: UUID)
class InactiveSession : RuntimeException()

@Service
class ActiveSessions(private val accounts: AccountRepository, private val revocations: RevokedSessionRepository) {
    fun requireActive(actor: Actor) {
        if (!accounts.existsBySubjectAndEnabledTrue(actor.subject) ||
            revocations.existsByIdAndSubject(actor.session, actor.subject)) throw InactiveSession()
    }
}
