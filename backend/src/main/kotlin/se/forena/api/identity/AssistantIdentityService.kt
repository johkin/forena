package se.forena.api.identity

import java.util.UUID
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import se.forena.api.identity.internal.AssistantIdentityRepository

@Service
class AssistantIdentityService(
    private val repository: AssistantIdentityRepository,
    private val sessions: SessionService,
) {
    @Transactional(readOnly = true)
    fun organizations(actor: Actor): List<AssistantOrganization> {
        sessions.requireActive(actor)
        return repository.findOrganizations(actor.subject)
    }

    @Transactional(readOnly = true)
    fun viewer(actor: Actor, org: UUID?, team: UUID?): AssistantViewer {
        sessions.requireActive(actor)
        val ages = repository.findOwnAges(actor.subject, org == null, org).distinct()
        val age = ages.singleOrNull()
        val roles =
            repository
                .findOwnTeamRoles(actor.subject, team, team == null, org, org == null)
                .toMutableList()
        val guardian = repository.hasGuardianAccess(actor.subject, org == null, org)
        if (guardian) roles.add("guardian")
        return AssistantViewer(
            roles.distinct(),
            when {
                age == null || age < 0 -> "unknown"
                age < 13 -> "under13"
                age < 18 -> "13to17"
                else -> "adult"
            },
        )
    }
}
