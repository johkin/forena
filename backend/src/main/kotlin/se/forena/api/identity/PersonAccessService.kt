package se.forena.api.identity

import java.util.UUID
import org.springframework.stereotype.Service
import se.forena.api.identity.internal.PersonAccessRepository
import se.forena.api.identity.internal.PersonRepository

/** Explicit person access, including own identity and delegated access; never token metadata. */
@Service
class PersonAccessService(private val links: PersonAccessRepository, private val people: PersonRepository) {
    fun people(actor: Actor): List<AccessiblePerson> {
        val active = links.effective(actor.subject)
        if (active.isEmpty()) return emptyList()
        val organizations = active.associate { it.key.personId to it.organizationId }
        val byPerson = active.associateBy { it.key.personId }
        return people.findByIdInOrderByDisplayNameAsc(organizations.keys)
            .filter { organizations[it.id] == it.organizationId }
            .map { AccessiblePerson(it.id, it.displayName, it.organizationId, byPerson.getValue(it.id).kind) }
    }

    fun people(actor: Actor, organization: UUID): List<AccessiblePerson> {
        val active = links.effective(actor.subject).filter { it.organizationId == organization }
        val ids = active.map { it.key.personId }
        val byPerson = active.associateBy { it.key.personId }
        if (ids.isEmpty()) return emptyList()
        return people.findByIdInOrderByDisplayNameAsc(ids)
            .filter { it.organizationId == organization }.map { AccessiblePerson(it.id, it.displayName, it.organizationId, byPerson.getValue(it.id).kind) }
    }

    fun canActFor(actor: Actor, person: UUID, organization: UUID): Boolean =
        links.effective(actor.subject).any { it.key.personId == person && it.organizationId == organization }
}
