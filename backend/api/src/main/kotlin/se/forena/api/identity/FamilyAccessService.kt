package se.forena.api.identity

import java.util.UUID
import org.springframework.stereotype.Service
import se.forena.api.identity.internal.PersonAccessKey
import se.forena.api.identity.internal.PersonAccessRepository
import se.forena.api.identity.internal.PersonRepository

/** Family authorization lives here; no permissions come from token metadata. */
@Service
class FamilyAccessService(private val links: PersonAccessRepository, private val people: PersonRepository) {
    fun people(actor: Actor, organization: UUID): List<FamilyPerson> {
        val ids = links.findByKeySubjectAndOrganizationIdAndActiveTrue(actor.subject, organization)
            .map { it.key.personId }
        if (ids.isEmpty()) return emptyList()
        return people.findByIdInOrderByDisplayNameAsc(ids)
            .filter { it.organizationId == organization }.map { FamilyPerson(it.id, it.displayName) }
    }

    fun canActFor(actor: Actor, person: UUID, organization: UUID): Boolean =
        links.findById(PersonAccessKey(person, actor.subject)).orElse(null)
            ?.let { it.active && it.organizationId == organization } == true
}
