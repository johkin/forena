package se.forena.api.identity

import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import se.forena.api.identity.authentication.AccountService
import se.forena.api.identity.authentication.AuthMailService
import org.springframework.stereotype.Service
import se.forena.api.identity.internal.RosterIdentityRepository

/** Identity facts for a roster already authorized by its calling service. */
@Service
class RosterDirectory(private val records: RosterIdentityRepository,
    private val accounts: AccountService,
    private val mail: AuthMailService) {
    fun activeAccount(subject: UUID): Boolean = records.activeAccount(subject)

    fun normalizeEmail(value: String): String = accounts.email(value)

    fun create(organization: UUID, name: String, birthDate: LocalDate?): UUID {
        require(name.trim().length in 1..160)
        val id = UUID.randomUUID()
        check(records.create(id, organization, name.trim(), birthDate) == 1)
        return id
    }

    fun verifiedEmail(subject: UUID): String = accounts.requireUser(subject).email

    fun link(organization: UUID, person: UUID, subject: UUID) {
        accounts.requireUser(subject)
        check(records.link(organization, person, subject) == 1)
    }

    fun invite(email: String, link: String, expires: Instant): UUID = mail.enqueue(email, "roster", link, expires)

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
