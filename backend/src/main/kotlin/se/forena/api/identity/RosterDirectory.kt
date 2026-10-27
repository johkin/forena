package se.forena.api.identity

import java.util.UUID
import org.springframework.stereotype.Service
import se.forena.api.identity.internal.RosterIdentityRepository

/** Identity facts for a roster already authorized by its calling service. */
@Service
class RosterDirectory(private val records: RosterIdentityRepository) {
    fun actorName(organization: UUID, subject: UUID): String =
        records.actorName(organization, subject) ?: "Användare utan visningsnamn"

    fun guardians(organization: UUID, people: Collection<UUID>): List<RosterGuardian> =
        if (people.isEmpty()) emptyList() else records.guardians(organization, people)

    fun accounts(organization: UUID, people: Collection<UUID>): List<RosterSelf> =
        if (people.isEmpty()) emptyList() else records.accounts(organization, people)

    fun rename(organization: UUID, person: UUID, name: String) {
        require(name.trim().length in 1..160)
        check(records.rename(organization, person, name.trim()) == 1)
    }
}
