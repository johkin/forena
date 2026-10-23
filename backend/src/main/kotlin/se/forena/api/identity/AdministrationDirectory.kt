package se.forena.api.identity

import java.util.Locale
import java.util.UUID
import org.springframework.stereotype.Service
import se.forena.api.identity.internal.AccountRepository
import se.forena.api.identity.internal.UserRepository
import se.forena.api.identity.internal.PersonAccessRepository
import se.forena.api.identity.internal.AdministrationPersonRepository

/** Identity facts only. The calling administration service must authorize every role change. */
@Service
class AdministrationDirectory(
    private val users: UserRepository,
    private val accounts: AccountRepository,
    private val links: PersonAccessRepository,
    private val people: AdministrationPersonRepository
) {
    fun email(subject: UUID): String = users.findById(subject)?.email ?: "Borttaget konto"

    fun verifiedEmail(subject: UUID): String {
        val user = users.findById(subject) ?: throw IllegalArgumentException("Account unavailable")
        require(user.verified && accounts.existsBySubjectAndEnabledTrue(subject))
        return user.email
    }

    fun verifiedAccount(email: String): UUID {
        val user = users.findByEmail(email.trim().lowercase(Locale.ROOT)) ?: throw IllegalArgumentException("Account unavailable")
        verifiedEmail(user.subject)
        return user.subject
    }

    fun ownsPerson(subject: UUID, organization: UUID, person: UUID): Boolean =
        links.findByKeySubjectAndOrganizationIdAndActiveTrue(subject, organization).any { it.key.personId == person && it.kind == "self" }

    fun ownPerson(subject: UUID, organization: UUID, name: String): UUID {
        verifiedEmail(subject)
        val own = links.findByKeySubjectAndOrganizationIdAndActiveTrue(subject, organization).filter { it.kind == "self" }
        check(own.size <= 1)
        if (own.isNotEmpty()) return own.single().key.personId
        require(name.trim().length in 1..200)
        val id = UUID.randomUUID()
        people.createPerson(id, organization, name.trim())
        people.createAccess(id, organization, subject)
        return id
    }
}
