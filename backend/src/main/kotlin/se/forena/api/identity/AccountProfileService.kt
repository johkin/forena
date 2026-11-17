package se.forena.api.identity

import java.time.ZoneId
import java.time.LocalDate
import java.util.UUID
import org.springframework.http.HttpStatus.CONFLICT
import org.springframework.security.access.AccessDeniedException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import se.forena.api.identity.authentication.AccountService
import se.forena.api.identity.internal.AccountProfileRepository

@Service
@Transactional
class AccountProfileService(
    private val repository: AccountProfileRepository, private val sessions: SessionService,
    private val accounts: AccountService, private val lifecycle: AccountLifecycleService,
    private val followers: AccountFollowerService,
) {
    fun clubView(organization: UUID, people: Collection<UUID>): ClubAccountView =
        ClubAccountView(repository.clubPeople(organization, people), repository.proposalsForPeople(people))
    fun clubHistory(organization: UUID, person: UUID): List<ProfileHistory> {
        require(repository.clubPeople(organization, listOf(person)).isNotEmpty())
        return repository.history(person)
    }
    fun correctBirthDate(actor: Actor, organization: UUID, person: UUID, command: BirthDateCorrectionCommand) {
        repository.lockPeople(listOf(person))
        val before = repository.clubPeople(organization, listOf(person)).single()
        repository.affectedSubjects(person).forEach { lifecycle.refresh(it) }
        if (repository.correctBirthDate(organization, person, command) != 1) conflict()
        repository.clubAudit(actor.subject, organization, person, "Födelsedatum: ${before.birthDate} → ${command.birthDate}")
        repository.affectedSubjects(person).forEach { lifecycle.refresh(it) }
    }
    fun review(actor: Actor, organization: UUID, proposal: UUID, approve: Boolean, people: Set<UUID>) {
        val current = repository.proposalsForPeople(people).singleOrNull { it.id == proposal }
            ?: throw AccessDeniedException("Proposal outside team")
        repository.affectedSubjects(current.personId).forEach { lifecycle.refresh(it) }
        if (approve) repository.proposalSubject(current.email)?.let { lifecycle.refresh(it) }
        val changed = repository.review(organization, proposal, actor.subject, approve)
        repository.clubAudit(actor.subject, organization, changed.personId, "Vårdnadshavarförslag ${changed.operation}: ${if (approve) "godkänt" else "avslaget"}")
        repository.affectedSubjects(changed.personId).forEach { lifecycle.refresh(it) }
    }
    fun view(actor: Actor): AccountProfileView {
        sessions.requireActive(actor)
        val status = lifecycle.refresh(actor.subject)
        val people = repository.people(actor.subject).map {
            if (it.editable) it else it.copy(birthDate = null, phone = "", contactEmail = "", address = "")
        }
        return AccountProfileView(repository.own(actor.subject), accounts.requireUser(actor.subject).email,
            people, lifecycle.clubs(actor.subject), status.deletionAt, status.activated, followers.list(actor))
    }
    fun update(actor: Actor, command: OwnProfileCommand) {
        sessions.requireActive(actor)
        validate(command.name, command.phone)
        repository.lock(actor.subject)
        val own = repository.own(actor.subject)
        if (own.revision != command.revision) conflict()
        val people = lockedPeople(actor).filter { it.kind == "self" }
        checkVersions(people, command.people)
        repository.updateOwn(actor.subject, command.name.trim(), command.phone.trim())
        people.forEach {
            repository.updatePerson(it, command.name.trim(), command.phone.trim())
            repository.audit(actor.subject, it, changes(it, command.name.trim(), it.birthDate, command.phone.trim(), it.contactEmail, it.address))
        }
    }
    fun updateChild(actor: Actor, person: UUID, command: ChildProfileCommand) {
        sessions.requireActive(actor)
        validate(command.name, command.phone)
        require(command.address.length <= 1000 && command.contactEmail.length <= 320)
        if (command.contactEmail.isNotBlank()) accounts.email(command.contactEmail)
        require(command.birthDate == null || command.birthDate <= LocalDate.now(ZoneId.of("Europe/Stockholm")))
        repository.lock(actor.subject)
        val people = lockedPeople(actor)
        val target = child(people, person)
        val affected = if (target.linkGroup == null) listOf(target) else
            people.filter { it.kind == "guardian" && it.editable && it.linkGroup == target.linkGroup }
        checkVersions(affected, command.people)
        affected.flatMap { repository.affectedSubjects(it.id) }.distinct().forEach { lifecycle.refresh(it) }
        affected.forEach {
            repository.updateChild(it, command)
            repository.audit(actor.subject, it, changes(it, command.name.trim(), command.birthDate,
                command.phone.trim(), command.contactEmail.trim(), command.address.trim()))
            repository.affectedSubjects(it.id).forEach { subject -> lifecycle.refresh(subject) }
        }
    }
    fun link(actor: Actor, command: ChildLinkCommand) {
        sessions.requireActive(actor)
        require(command.people.size in 2..50)
        repository.lock(actor.subject)
        val people = lockedPeople(actor)
        val selected = command.people.map { child(people, it) }
        require(selected.map { it.organizationId }.distinct().size == selected.size)
        // Never infer identity from name, email or date of birth.
        repository.link(actor.subject, command.people)
    }
    fun unlink(actor: Actor, group: UUID) {
        sessions.requireActive(actor)
        repository.lock(actor.subject)
        repository.unlink(actor.subject, group)
    }
    fun history(actor: Actor, person: UUID): List<ProfileHistory> {
        sessions.requireActive(actor)
        child(repository.people(actor.subject), person)
        return repository.history(person)
    }
    fun proposals(actor: Actor, person: UUID): List<GuardianProposalView> {
        sessions.requireActive(actor)
        child(repository.people(actor.subject), person)
        return repository.proposals(person)
    }
    fun propose(actor: Actor, person: UUID, command: GuardianProposalCommand) {
        sessions.requireActive(actor)
        require(command.operation in setOf("add", "remove", "birth-date-correction"))
        repository.lock(actor.subject)
        val people = lockedPeople(actor)
        val target = if (command.operation == "birth-date-correction")
            people.singleOrNull { it.id == person && it.kind == "guardian" } ?: throw AccessDeniedException("No relationship")
        else child(people, person)
        repository.propose(actor.subject, target, command.copy(email = accounts.email(command.email)))
    }
    private fun lockedPeople(actor: Actor): List<AccountPerson> {
        repository.lockPeople(repository.people(actor.subject).map { it.id })
        repository.lockAccess(actor.subject)
        sessions.requireActive(actor)
        return repository.people(actor.subject)
    }
    private fun child(people: List<AccountPerson>, id: UUID): AccountPerson =
        people.singleOrNull { it.id == id && it.kind == "guardian" && it.editable }
            ?: throw AccessDeniedException("Guardian access required")
    private fun checkVersions(people: List<AccountPerson>, expected: Map<UUID, Long>) {
        if (people.associate { it.id to it.revision } != expected) conflict()
    }
    private fun validate(name: String, phone: String) {
        require(name.trim().length in 1..120 && phone.length <= 80)
    }
    private fun changes(person: AccountPerson, name: String, birthDate: LocalDate?, phone: String, email: String, address: String): String =
        listOfNotNull(
            change("Namn", person.name, name), change("Födelsedatum", person.birthDate?.toString().orEmpty(), birthDate?.toString().orEmpty()),
            change("Telefon", person.phone, phone), change("Kontaktadress", person.contactEmail, email), change("Adress", person.address, address),
        ).joinToString("\n").ifEmpty { "Inga ändrade uppgifter" }
    private fun change(label: String, before: String, after: String): String? =
        if (before == after) null else "$label: $before → $after"
    private fun conflict(): Nothing = throw ResponseStatusException(CONFLICT, "Uppgifterna har ändrats. Läs in aktuellt underlag och stäm av ditt utkast.")
}
