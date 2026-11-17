package se.forena.api.identity

import java.time.Duration
import java.util.UUID
import org.springframework.security.access.AccessDeniedException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import se.forena.api.identity.authentication.AuthMailService
import se.forena.api.identity.internal.AccountFollowerRepository
import se.forena.api.identity.internal.AccountProfileRepository

@Service
@Transactional
class AccountFollowerService(
    private val repository: AccountFollowerRepository, private val profiles: AccountProfileRepository,
    private val clock: DatabaseClockService, private val mail: AuthMailService,
    private val settings: BrowserSessionSettings, private val lifecycle: AccountLifecycleService,
    private val sessions: SessionService,
) {
    fun list(actor: Actor): List<FollowerView> {
        repository.revokeInvalid()
        return repository.list(actor.subject).map { it.copy(teams = repository.teams(it.personId)) }
    }
    fun request(actor: Actor, person: UUID) {
        profiles.lock(actor.subject)
        sessions.requireActive(actor)
        val target = repository.target(actor.subject, person) ?: throw AccessDeniedException("Former guardian required")
        val expires = clock.now().plus(Duration.ofDays(30))
        val created = repository.request(actor.subject, person, target.organizationId, expires)
        target.email?.takeIf { created }?.let { mail.enqueue(it, "follower", "${settings.origin}/account", expires) }
    }
    fun decide(actor: Actor, id: UUID, state: String) {
        require(state in setOf("approved", "denied", "revoked"))
        profiles.lock(actor.subject)
        sessions.requireActive(actor)
        val requester = repository.requester(id)
        lifecycle.connectionsChanged(requester)
        if (repository.decision(actor.subject, id, state) != 1) throw AccessDeniedException("Approval not available")
        lifecycle.connectionsChanged(requester)
    }
    fun matches(actor: Actor, id: UUID): List<FollowerMatch> {
        repository.revokeInvalid()
        if (repository.list(actor.subject).none { it.id == id && !it.incoming && it.state == "approved" })
            throw AccessDeniedException("Follower access required")
        return repository.matches(actor.subject, id)
    }
}
