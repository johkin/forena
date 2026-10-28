package se.forena.api.identity.internal

import java.time.Instant
import java.util.Optional
import java.util.UUID
import org.springframework.data.jdbc.repository.query.Modifying
import org.springframework.data.jdbc.repository.query.Query
import org.springframework.data.repository.Repository
import se.forena.api.identity.*
import se.forena.api.identity.NotificationRecipient
import se.forena.api.identity.RosterGuardian
import se.forena.api.identity.RosterSelf

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

interface AssistantIdentityRepository : Repository<PersonEntity, UUID> {
    @Query(
        """select o.id,o.name,o.time_zone from forena.organization o where
            exists(select 1 from forena.person_access a where a.organization_id=o.id and a.subject=:subject and a.active)
            or exists(select 1 from forena.organization_member m where m.organization_id=o.id and m.subject=:subject and m.active)
            or exists(select 1 from forena.section_administrator s where s.organization_id=o.id and s.subject=:subject and s.active)
            or exists(select 1 from forena.team_permission_assignment p join forena.person_access a
            on a.person_id=p.person_id and a.organization_id=p.organization_id and a.kind='self' and a.active
            where a.subject=:subject and p.organization_id=o.id and p.active
            and p.starts_on<=(clock_timestamp() at time zone o.time_zone)::date
            and (p.ends_on is null or p.ends_on>=(clock_timestamp() at time zone o.time_zone)::date))
            order by o.name,o.id"""
    )
    fun findOrganizations(subject: UUID): List<AssistantOrganization>

    @Query(
        """select distinct extract(year from age((clock_timestamp() at time zone o.time_zone)::date,p.birth_date))::int
            from forena.person p join forena.person_access a on a.person_id=p.id and a.organization_id=p.organization_id
            join forena.organization o on o.id=p.organization_id
            where a.subject=:subject and a.kind='self' and a.active and p.birth_date is not null
            and (:allOrganizations or p.organization_id=:org)"""
    )
    fun findOwnAges(subject: UUID, allOrganizations: Boolean, org: UUID?): List<Int>

    @Query(
        """select distinct m.role from forena.team_membership m join forena.person_access a
            on a.person_id=m.person_id and a.organization_id=m.organization_id and a.active and a.kind='self'
            join forena.organization o on o.id=m.organization_id
            where a.subject=:subject and m.active and (:allTeams or m.team_id=:team)
            and (:allOrganizations or m.organization_id=:org)
            and m.starts_on<=(clock_timestamp() at time zone o.time_zone)::date
            and (m.ends_on is null or m.ends_on>=(clock_timestamp() at time zone o.time_zone)::date)"""
    )
    fun findOwnTeamRoles(
        subject: UUID,
        team: UUID?,
        allTeams: Boolean,
        org: UUID?,
        allOrganizations: Boolean,
    ): List<String>

    @Query(
        "select exists(select 1 from forena.person_access where subject=:subject and active and kind='guardian' and (:allOrganizations or organization_id=:org))"
    )
    fun hasGuardianAccess(subject: UUID, allOrganizations: Boolean, org: UUID?): Boolean
}

interface TelegramIdentityRepository : Repository<TelegramConnectionEntity, UUID> {
    @Query("select subject from forena.telegram_pairing where fingerprint=:hash and expires_at>:now")
    fun pairingSubject(hash: String, now: Instant): Optional<UUID>

    @Query("select subject from forena.account where subject=:subject for update")
    fun lockAccount(subject: UUID): UUID

    @Modifying
    @Query("delete from forena.telegram_pairing where subject=:subject or expires_at<=:now")
    fun deleteExpiredPairings(subject: UUID, now: Instant): Int

    @Modifying
    @Query(
        "insert into forena.telegram_pairing(fingerprint,subject,expires_at) values(:hash,:subject,:expiry)"
    )
    fun createPairing(hash: String, subject: UUID, expiry: Instant): Int

    @Query(
        "delete from forena.telegram_pairing where fingerprint=:hash and expires_at>:now returning subject"
    )
    fun consumePairing(hash: String, now: Instant): Optional<UUID>

    @Modifying
    @Query(
        "insert into forena.telegram_link(id,subject,telegram_user_id,chat_id,auth_version,last_update) values(:id,:subject,:user,:chat,:version,:update)"
    )
    fun createConnection(
        id: UUID,
        subject: UUID,
        user: Long,
        chat: Long,
        version: Long,
        update: Long,
    ): Int

    @Modifying
    @Query("delete from forena.telegram_pairing where subject=:subject")
    fun deletePairings(subject: UUID): Int

    @Modifying
    @Query("delete from forena.telegram_link where subject=:subject")
    fun deleteConnection(subject: UUID): Int

    @Modifying
    @Query(
        "update forena.assistant_proposal set state='invalid' where subject=:subject and state='pending' and conversation_id in (select id from forena.assistant_conversation where subject=:subject and channel='telegram')"
    )
    fun invalidateProposals(subject: UUID): Int

    @Modifying
    @Query(
        "update forena.assistant_conversation set active=false where subject=:subject and channel='telegram'"
    )
    fun archiveConversations(subject: UUID): Int

    @Query(
        "select id,subject,telegram_user_id,chat_id,auth_version from forena.telegram_link where telegram_user_id=:user and chat_id=:chat"
    )
    fun findConnection(user: Long, chat: Long): Optional<TelegramConnection>

    @Query(
        "select id,subject,telegram_user_id,chat_id,auth_version from forena.telegram_link where subject=:subject"
    )
    fun findConnectionForSubject(subject: UUID): Optional<TelegramConnection>

    @Modifying
    @Query(
        "update forena.telegram_link set last_update=:update where id=:id and last_update<:update"
    )
    fun advanceUpdate(update: Long, id: UUID): Int
}
