package se.forena.api.identity.internal

import se.forena.api.identity.NotificationRecipient
import se.forena.api.identity.RosterGuardian
import se.forena.api.identity.RosterSelf

import java.time.Instant
import java.util.Optional
import java.util.UUID
import org.springframework.data.jdbc.repository.query.Modifying
import org.springframework.data.jdbc.repository.query.Query
import org.springframework.data.repository.Repository

interface AccountRepository : Repository<AccountEntity, UUID> {
    fun existsBySubjectAndEnabledTrue(subject: UUID): Boolean
}

/** Current wall clock, including time spent waiting for row locks. */
interface DatabaseClockRepository : Repository<AccountEntity, UUID> {
    @Query("select clock_timestamp()")
    fun databaseTime(): Instant
}

interface RevokedSessionRepository : Repository<RevokedSessionEntity, UUID> {
    fun existsByIdAndSubject(id: UUID, subject: UUID): Boolean
}

interface PersonAccessRepository : Repository<PersonAccessEntity, PersonAccessKey> {
    fun findByKeySubjectAndActiveTrue(subject: UUID): List<PersonAccessEntity>
    fun findById(id: PersonAccessKey): Optional<PersonAccessEntity>
    fun findByKeySubjectAndOrganizationIdAndActiveTrue(subject: UUID, organizationId: UUID): List<PersonAccessEntity>
}

interface PersonRepository : Repository<PersonEntity, UUID> {
    fun findByIdInOrderByDisplayNameAsc(ids: Collection<UUID>): List<PersonEntity>
}

interface UserRepository : Repository<UserEntity, UUID> {
    fun findById(subject: UUID): UserEntity?
    fun findByEmail(email: String): UserEntity?
    @Modifying
    @Query("insert into forena.account(subject) values(:subject)")
    fun createAccount(subject: UUID): Int
    @Modifying
    @Query("insert into forena.native_user(subject,email,password_hash) values(:subject,:email,:passwordHash)")
    fun createUser(subject: UUID, email: String, passwordHash: String): Int
    @Modifying
    @Query("update forena.native_user set verified=true where subject=:subject and auth_version=:authVersion and verified=false")
    fun verifyEmail(subject: UUID, authVersion: Long): Int
    @Modifying
    @Query("update forena.native_user set password_hash=:passwordHash,auth_version=auth_version+1 where subject=:subject and auth_version=:authVersion and verified=true")
    fun resetPassword(subject: UUID, passwordHash: String, authVersion: Long): Int
    @Modifying
    @Query("update forena.native_user set password_hash=:passwordHash,auth_version=auth_version+1 where subject=:subject and verified=false")
    fun replacePendingPassword(subject: UUID, passwordHash: String): Int
    @Modifying
    @Query("update forena.account set enabled=:enabled where subject=:subject")
    fun setEnabled(subject: UUID, enabled: Boolean): Int
}

interface AdministrationPersonRepository : Repository<PersonEntity, UUID> {
    @Modifying
    @Query("insert into forena.person(id,organization_id,display_name) values(:person,:organization,:name)")
    fun createPerson(person: UUID, organization: UUID, name: String): Int
    @Modifying
    @Query("insert into forena.person_access(person_id,organization_id,subject,kind) values(:person,:organization,:subject,'self')")
    fun createAccess(person: UUID, organization: UUID, subject: UUID): Int
}

interface NotificationRecipientRepository : Repository<AccountEntity, UUID> {
    @Query("""
        select a.subject, u.email
        from forena.person_access p
        join forena.account a on a.subject = p.subject and a.enabled
        join forena.native_user u on u.subject = a.subject and u.verified
        where p.person_id = :person and p.organization_id = :organization and p.active
        order by a.subject
        limit 1001
    """)
    fun forPerson(person: UUID, organization: UUID): List<NotificationRecipient>
}

interface RosterIdentityRepository : Repository<PersonEntity, UUID> {
    @Query("""select p.display_name from forena.person_access a
        join forena.person p on p.id=a.person_id and p.organization_id=a.organization_id
        where a.subject=:subject and a.organization_id=:organization and a.kind='self' and a.active
        order by p.id limit 1""")
    fun actorName(organization: UUID, subject: UUID): String?

    @Query("""select g.person_id,g.subject,
        coalesce(nullif(g.contact_name,''),p.display_name,'Målsman') as name,g.contact_phone as phone
        from forena.person_access g
        left join forena.person_access a on a.subject=g.subject and a.organization_id=g.organization_id and a.kind='self' and a.active
        left join forena.person p on p.id=a.person_id and p.organization_id=a.organization_id
        where g.organization_id=:organization and g.person_id in (:people) and g.kind='guardian' and g.active
        order by name,g.subject""")
    fun guardians(organization: UUID, people: Collection<UUID>): List<RosterGuardian>

    @Query("""select person_id,subject from forena.person_access
        where organization_id=:organization and person_id in (:people) and kind='self' and active""")
    fun accounts(organization: UUID, people: Collection<UUID>): List<RosterSelf>

    @Modifying
    @Query("update forena.person set display_name=:name where id=:person and organization_id=:organization")
    fun rename(organization: UUID, person: UUID, name: String): Int
}
