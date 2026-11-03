package se.forena.api.activities.internal

import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import org.springframework.data.jdbc.repository.query.Modifying
import org.springframework.data.jdbc.repository.query.Query
import org.springframework.data.repository.Repository
import se.forena.api.activities.RosterCandidate
import se.forena.api.activities.RosterLoginStatus

interface RosterRegistrationRepository : Repository<TeamEntity, UUID> {
    @Query("""select p.id,p.display_name as name,p.birth_date from forena.person p
        where p.organization_id=:organization and (position(lower(:query) in lower(p.display_name))>0
        or exists(select 1 from forena.person_access a join forena.native_user u on u.subject=a.subject
          where a.person_id=p.id and a.organization_id=p.organization_id and a.kind='self' and u.email=lower(:query))
        or exists(select 1 from forena.roster_login_invitation i
          where i.person_id=p.id and i.organization_id=p.organization_id and i.email=lower(:query) and not i.revoked))
        order by p.display_name,p.id limit 50""")
    fun candidates(organization: UUID, query: String): List<RosterCandidate>

    @Query("select id,display_name as name,birth_date from forena.person where organization_id=:organization and id=:person")
    fun person(organization: UUID, person: UUID): RosterCandidate?

    @Query("select person_id from forena.roster_registration where request_id=:request and team_id=:team and actor_subject=:actor")
    fun registered(request: UUID, team: UUID, actor: UUID): UUID?

    @Modifying
    @Query("insert into forena.roster_registration(request_id,team_id,actor_subject,person_id) values(:request,:team,:actor,:person)")
    fun record(request: UUID, team: UUID, actor: UUID, person: UUID): Int

    @Query("""select exists(select 1 from forena.team_membership where team_id=:team and person_id=:person
        and role=:role and active and (ends_on is null or ends_on>=:start))""")
    fun overlaps(team: UUID, person: UUID, role: String, start: LocalDate): Boolean

    @Modifying
    @Query("""insert into forena.team_membership(organization_id,team_id,person_id,role,starts_on)
        values(:organization,:team,:person,:role,:start)""")
    fun add(organization: UUID, team: UUID, person: UUID, role: String, start: LocalDate): Int

    @Query("""select i.person_id,i.email,case when i.accepted_by is not null then 'accepted'
        when i.revoked then 'revoked' when i.expires_at<=clock_timestamp() then 'expired'
        when m.delivered_at is not null then 'sent' when m.attempts>=5 then 'failed' else 'queued' end as status
        from forena.roster_login_invitation i left join forena.auth_mail_outbox m on m.id=i.mail_id
        where i.team_id=:team and i.id=(select j.id from forena.roster_login_invitation j
          where j.person_id=i.person_id order by j.created_at desc,j.id limit 1)""")
    fun statuses(team: UUID): List<RosterLoginStatus>

    @Query("select created_at from forena.roster_login_invitation where person_id=:person order by created_at desc limit 1")
    fun lastSent(person: UUID): Instant?

    @Modifying
    @Query("update forena.roster_login_invitation set revoked=true where person_id=:person and accepted_by is null")
    fun revoke(person: UUID): Int

    @Modifying
    @Query("""insert into forena.roster_login_invitation(id,organization_id,team_id,person_id,email,token_hash,inviter,mail_id,expires_at)
        values(:id,:organization,:team,:person,:email,:hash,:inviter,:mail,:expires)""")
    fun invite(id: UUID, organization: UUID, team: UUID, person: UUID, email: String, hash: String, inviter: UUID, mail: UUID, expires: Instant): Int

    @Query("select id from forena.roster_login_invitation where token_hash=:hash and not revoked and accepted_by is null and expires_at>clock_timestamp()")
    fun invitationId(hash: String): UUID?

    @Query("select * from forena.roster_login_invitation where id=:id")
    fun invitation(id: UUID): RosterLoginInvitationEntity?

    @Query("select id from forena.person where id=:person and organization_id=:organization for update")
    fun lockPerson(organization: UUID, person: UUID): UUID?

    @Modifying
    @Query("update forena.roster_login_invitation set accepted_by=:subject where id=:id and accepted_by is null and not revoked and expires_at>clock_timestamp()")
    fun accept(id: UUID, subject: UUID): Int
}
