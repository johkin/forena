package se.forena.api.identity.internal

import java.time.Instant
import java.time.ZoneId
import java.util.UUID
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import org.springframework.http.HttpStatus.TOO_MANY_REQUESTS
import org.springframework.web.server.ResponseStatusException
import se.forena.api.identity.*

@Repository
class AccountProfileRepository(private val jdbc: JdbcClient) {
    fun timeZone(organization: UUID): ZoneId = ZoneId.of(jdbc.sql("select time_zone from forena.organization where id=:org")
        .param("org", organization).query(String::class.java).single())
    fun lockProposal(organization: UUID, proposal: UUID, people: Set<UUID>): UUID {
        if (people.isEmpty()) throw NoSuchElementException()
        return jdbc.sql("select person_id from forena.account_guardian_proposal where id=:id and organization_id=:org and person_id in (:people) for update")
            .param("id", proposal).param("org", organization).param("people", people).query(UUID::class.java)
            .optional().orElseThrow { NoSuchElementException() }
    }
    fun clubPeople(organization: UUID, ids: Collection<UUID>): List<ClubAccountPerson> {
        if (ids.isEmpty()) return emptyList()
        return jdbc.sql("select id,display_name as name,birth_date,profile_revision as revision from forena.person where organization_id=:org and id in (:ids) order by display_name,id")
            .param("org", organization).param("ids", ids).query(ClubAccountPerson::class.java).list().map { requireNotNull(it) }
    }
    fun correctBirthDate(organization: UUID, person: UUID, command: BirthDateCorrectionCommand): Int =
        jdbc.sql("update forena.person set birth_date=:birthDate,profile_revision=profile_revision+1 where organization_id=:org and id=:person and profile_revision=:revision")
            .param("org", organization).param("person", person).param("birthDate", command.birthDate, java.sql.Types.DATE).param("revision", command.revision).update()
    fun affectedSubjects(person: UUID): List<UUID> = jdbc.sql("select subject from forena.person_access where person_id=:person")
        .param("person", person).query(UUID::class.java).list().map { requireNotNull(it) }
    fun proposalSubject(email: String): UUID? = jdbc.sql("select subject from forena.native_user where email=:email and verified")
        .param("email", email).query(UUID::class.java).optional().orElse(null)
    fun review(organization: UUID, id: UUID, actor: UUID, approve: Boolean): GuardianProposalView {
        val proposal = jdbc.sql("select id,person_id,guardian_email as email,operation,state from forena.account_guardian_proposal where id=:id and organization_id=:org for update")
            .param("id", id).param("org", organization).query(GuardianProposalView::class.java).single()
        check(proposal.state == "pending")
        if (approve) {
            require(proposal.operation != "birth-date-correction")
            val subject = jdbc.sql("select u.subject from forena.native_user u join forena.account a on a.subject=u.subject and a.enabled where u.email=:email and u.verified")
                .param("email", proposal.email).query(UUID::class.java).optional().orElseThrow { IllegalArgumentException("Verified account required") }
            if (proposal.operation == "add") {
                val changed = jdbc.sql("""insert into forena.person_access(person_id,organization_id,subject,kind)
                    values(:person,:org,:subject,'guardian') on conflict(person_id,subject)
                    do update set active=true where person_access.kind='guardian'""")
                    .param("person", proposal.personId).param("org", organization).param("subject", subject).update()
                check(changed == 1)
            } else jdbc.sql("update forena.person_access set active=false where person_id=:person and organization_id=:org and subject=:subject and kind='guardian'")
                .param("person", proposal.personId).param("org", organization).param("subject", subject).update()
        }
        jdbc.sql("update forena.account_guardian_proposal set state=:state,reviewed_by=:actor where id=:id")
            .param("state", if (approve) "approved" else "denied").param("actor", actor).param("id", id).update()
        return proposal
    }
    fun clubAudit(subject: UUID, organization: UUID, person: UUID, changes: String) {
        jdbc.sql("insert into forena.person_profile_history(id,person_id,organization_id,actor_subject,changes) values(:id,:person,:org,:actor,:changes)")
            .param("id", UUID.randomUUID()).param("person", person).param("org", organization).param("actor", subject).param("changes", changes).update()
    }
    fun lock(subject: UUID) {
        jdbc.sql("select subject from forena.account where subject=:subject for update")
            .param("subject", subject).query(UUID::class.java).single()
    }
    fun own(subject: UUID): OwnProfile = jdbc.sql("select display_name as name,phone,profile_revision as revision from forena.account where subject=:subject")
        .param("subject", subject).query(OwnProfile::class.java).single()

    fun people(subject: UUID): List<AccountPerson> = jdbc.sql("""
        select p.id,p.organization_id,o.name as organization_name,a.kind,p.display_name as name,
        p.birth_date,p.phone,p.contact_email,p.address,p.profile_revision as revision,
        (a.kind='self' or (p.birth_date is null or p.birth_date + interval '18 years' >
            (clock_timestamp() at time zone o.time_zone)::date)) as editable,l.group_id as link_group
        from forena.person_access a join forena.person p on p.id=a.person_id and p.organization_id=a.organization_id
        join forena.organization o on o.id=p.organization_id
        left join forena.account_child_link l on l.subject=a.subject and l.person_id=p.id
        where a.subject=:subject and a.active order by o.name,p.id
    """).param("subject", subject).query(AccountPerson::class.java).list().map { requireNotNull(it) }

    fun lockPeople(ids: Collection<UUID>) {
        if (ids.isNotEmpty()) jdbc.sql("select id from forena.person where id in (:ids) order by id for update")
            .param("ids", ids).query(UUID::class.java).list().map { requireNotNull(it) }
    }
    fun lockAccess(subject: UUID) {
        jdbc.sql("select person_id from forena.person_access where subject=:subject order by person_id for update")
            .param("subject", subject).query(UUID::class.java).list().map { requireNotNull(it) }
    }
    fun updateOwn(subject: UUID, name: String, phone: String) {
        jdbc.sql("update forena.account set display_name=:name,phone=:phone,profile_revision=profile_revision+1 where subject=:subject")
            .param("name", name).param("phone", phone).param("subject", subject).update()
    }
    fun updatePerson(person: AccountPerson, name: String, phone: String) {
        jdbc.sql("update forena.person set display_name=:name,phone=:phone,profile_revision=profile_revision+1 where id=:person")
            .param("name", name).param("phone", phone).param("person", person.id).update()
    }
    fun updateChild(person: AccountPerson, command: ChildProfileCommand) {
        jdbc.sql("""update forena.person set display_name=:name,birth_date=:birthDate,phone=:phone,
            contact_email=:email,address=:address,profile_revision=profile_revision+1 where id=:person""")
            .param("name", command.name.trim()).param("birthDate", command.birthDate, java.sql.Types.DATE)
            .param("phone", command.phone.trim()).param("email", command.contactEmail.trim())
            .param("address", command.address.trim()).param("person", person.id).update()
    }
    fun audit(subject: UUID, person: AccountPerson, changes: String) {
        jdbc.sql("insert into forena.person_profile_history(id,person_id,organization_id,actor_subject,changes) values(:id,:person,:org,:actor,:changes)")
            .param("id", UUID.randomUUID()).param("person", person.id).param("org", person.organizationId)
            .param("actor", subject).param("changes", changes).update()
    }
    fun history(person: UUID, offset: Int = 0): List<ProfileHistory> = jdbc.sql("""
        select h.id,coalesce(nullif(a.display_name,''),case when a.enabled then 'Användare' else 'Borttaget konto' end) as actor,h.changed_at,h.changes
        from forena.person_profile_history h join forena.account a on a.subject=h.actor_subject
        where h.person_id=:person order by h.changed_at desc,h.id limit 100 offset :offset
    """).param("person", person).param("offset", offset).query(ProfileHistory::class.java).list().map { requireNotNull(it) }

    fun link(subject: UUID, ids: Set<UUID>) {
        val group = UUID.randomUUID()
        ids.forEach { person ->
            jdbc.sql("""insert into forena.account_child_link(subject,person_id,group_id) values(:subject,:person,:group)
                on conflict(subject,person_id) do update set group_id=excluded.group_id""")
                .param("subject", subject).param("person", person).param("group", group).update()
        }
    }
    fun unlink(subject: UUID, group: UUID) {
        jdbc.sql("delete from forena.account_child_link where subject=:subject and group_id=:group")
            .param("subject", subject).param("group", group).update()
    }
    fun propose(subject: UUID, person: AccountPerson, command: GuardianProposalCommand): UUID {
        val existing = jdbc.sql("""select id from forena.account_guardian_proposal where person_id=:person
            and guardian_email=:email and operation=:operation and state='pending'""")
            .param("person", person.id).param("email", command.email).param("operation", command.operation)
            .query(UUID::class.java).optional().orElse(null)
        if (existing != null) return existing
        val count = jdbc.sql("select count(*) from forena.account_guardian_proposal where person_id=:person and state='pending'")
            .param("person", person.id).query(Long::class.java).single()
        if (count >= 100) throw ResponseStatusException(TOO_MANY_REQUESTS, "Too many pending proposals")
        val id = UUID.randomUUID()
        jdbc.sql("""insert into forena.account_guardian_proposal(id,proposer,person_id,organization_id,guardian_email,operation)
            values(:id,:subject,:person,:org,:email,:operation)""")
            .param("id", id).param("subject", subject).param("person", person.id).param("org", person.organizationId)
            .param("email", command.email).param("operation", command.operation).update()
        return id
    }
    fun proposals(person: UUID): List<GuardianProposalView> = proposalsForPeople(listOf(person))
    fun proposalForPeople(id: UUID, people: Set<UUID>): GuardianProposalView? {
        if (people.isEmpty()) return null
        return jdbc.sql("""select id,person_id,guardian_email as email,operation,state from forena.account_guardian_proposal
            where id=:id and person_id in (:people)""").param("id", id).param("people", people)
            .query(GuardianProposalView::class.java).optional().orElse(null)
    }
    fun proposalsForPeople(people: Collection<UUID>, offset: Int = 0): List<GuardianProposalView> {
        if (people.isEmpty()) return emptyList()
        return jdbc.sql("""
            select id,person_id,guardian_email as email,operation,state from forena.account_guardian_proposal
            where person_id in (:people) and state='pending' order by created_at desc,id limit 100 offset :offset
        """).param("people", people).param("offset", offset).query(GuardianProposalView::class.java).list().map { requireNotNull(it) }
    }
}
