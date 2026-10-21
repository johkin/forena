package se.forena.api.identity

import java.util.UUID
import org.springframework.stereotype.Service
import se.forena.api.identity.internal.PersonAccessKey
import se.forena.api.identity.internal.PersonAccessRepository
import se.forena.api.identity.internal.PersonRepository

/** Explicit person access, including own identity and delegated access; never token metadata. */
@Service
class PersonAccessService(private val links: PersonAccessRepository, private val people: PersonRepository) {
    fun people(actor: Actor): List<AccessiblePerson> {
        val active = links.findByKeySubjectAndActiveTrue(actor.subject)
        if (active.isEmpty()) return emptyList()
        val organizations = active.associate { it.key.personId to it.organizationId }
        return people.findByIdInOrderByDisplayNameAsc(organizations.keys)
            .filter { organizations[it.id] == it.organizationId }
            .map { AccessiblePerson(it.id, it.displayName) }
    }

    fun people(actor: Actor, organization: UUID): List<AccessiblePerson> {
        val ids = links.findByKeySubjectAndOrganizationIdAndActiveTrue(actor.subject, organization)
            .map { it.key.personId }
        if (ids.isEmpty()) return emptyList()
        return people.findByIdInOrderByDisplayNameAsc(ids)
            .filter { it.organizationId == organization }.map { AccessiblePerson(it.id, it.displayName) }
    }

    fun canActFor(actor: Actor, person: UUID, organization: UUID): Boolean =
        links.findById(PersonAccessKey(person, actor.subject)).orElse(null)
            ?.let { it.active && it.organizationId == organization } == true
}
