package se.forena.api.identity.internal

import java.sql.Timestamp
import java.time.Instant
import java.util.UUID
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import se.forena.api.identity.*

@Repository
class AccountFollowerRepository(private val jdbc: JdbcClient) {
    fun target(subject: UUID, person: UUID): FollowerTarget? = jdbc.sql("""
        select p.organization_id,u.email from forena.person p join forena.organization o on o.id=p.organization_id
        join forena.person_access g on g.person_id=p.id and g.subject=:subject and g.kind='guardian'
        left join forena.person_access own on own.person_id=p.id and own.kind='self' and own.active
        left join forena.native_user u on u.subject=own.subject and u.verified
        where p.id=:person and p.birth_date+interval '18 years'<=(clock_timestamp() at time zone o.time_zone)::date
    """).param("subject", subject).param("person", person).query(FollowerTarget::class.java).optional().orElse(null)
    fun request(subject: UUID, person: UUID, org: UUID, expires: Instant): Boolean {
        jdbc.sql("update forena.account_follower set state='revoked' where subject=:subject and person_id=:person and state='pending' and expires_at<=clock_timestamp()")
            .param("subject", subject).param("person", person).update()
        return jdbc.sql("""insert into forena.account_follower(id,subject,person_id,organization_id,expires_at)
            values(:id,:subject,:person,:org,:expires) on conflict do nothing""")
            .param("id", UUID.randomUUID()).param("subject", subject).param("person", person)
            .param("org", org).param("expires", Timestamp.from(expires)).update() == 1
    }
    fun list(subject: UUID): List<FollowerView> = jdbc.sql("""
        select f.id,f.person_id,f.organization_id,o.name as organization_name,p.display_name as person_name,
            coalesce(nullif(a.display_name,''),'Förälder') as requester,f.state,
            (f.subject<>:subject) as incoming,f.expires_at
        from forena.account_follower f join forena.person p on p.id=f.person_id
        join forena.organization o on o.id=f.organization_id join forena.account a on a.subject=f.subject
        where (f.subject=:subject or exists(select 1 from forena.person_access own
            where own.subject=:subject and own.person_id=f.person_id and own.kind='self' and own.active))
        and (f.state='approved' or (f.state='pending' and f.expires_at>clock_timestamp())) order by f.created_at
    """).param("subject", subject).query(FollowerRow::class.java).list().map { row ->
        val it = requireNotNull(row)
        FollowerView(it.id, it.personId, it.organizationId, it.organizationName, it.personName, it.requester, it.state, it.incoming, it.expiresAt)
    }
    fun teams(person: UUID): List<String> = jdbc.sql("""
        select distinct t.name from forena.team_membership m join forena.team t on t.id=m.team_id
        join forena.organization o on o.id=t.organization_id
        where m.person_id=:person and m.active and m.starts_on<=(clock_timestamp() at time zone o.time_zone)::date
        and (m.ends_on is null or m.ends_on>=(clock_timestamp() at time zone o.time_zone)::date) order by t.name
    """).param("person", person).query(String::class.java).list().map { requireNotNull(it) }
    fun requester(id: UUID): UUID = jdbc.sql("select subject from forena.account_follower where id=:id")
        .param("id", id).query(UUID::class.java).single()
    fun decision(subject: UUID, id: UUID, state: String): Int = jdbc.sql("""
        update forena.account_follower f set state=:state where f.id=:id and
        ((:state='revoked' and f.subject=:subject and f.state='approved') or exists(
            select 1 from forena.person_access a join forena.person p on p.id=a.person_id
            join forena.organization o on o.id=p.organization_id
            where a.subject=:subject and a.kind='self' and a.active and a.person_id=f.person_id
            and p.birth_date+interval '18 years'<=(clock_timestamp() at time zone o.time_zone)::date
            and ((f.state='pending' and f.expires_at>clock_timestamp() and :state in ('approved','denied'))
                or (f.state='approved' and :state='revoked'))))
    """).param("subject", subject).param("id", id).param("state", state).update()
    fun revokeInvalid() {
        jdbc.sql("""update forena.account_follower f set state='revoked' where state='approved' and not exists(
            select 1 from forena.person_access own join forena.person p on p.id=own.person_id
            join forena.organization o on o.id=p.organization_id
            where own.person_id=f.person_id and own.organization_id=f.organization_id and own.kind='self' and own.active
            and p.birth_date+interval '18 years'<=(clock_timestamp() at time zone o.time_zone)::date)""").update()
    }
    fun matches(subject: UUID, id: UUID): List<FollowerMatch> = jdbc.sql("""
        select distinct a.id,a.title,a.starts_at,a.ends_at,a.location,null::text as result from forena.account_follower f
        join forena.team_membership m on m.person_id=f.person_id and m.organization_id=f.organization_id and m.active
        join forena.organization o on o.id=f.organization_id
        join forena.activity a on a.team_id=m.team_id and a.organization_id=f.organization_id
        join forena.activity_type k on k.id=a.activity_type_id and k.system_category='competition'
        where f.id=:id and f.subject=:subject and f.state='approved'
        and m.starts_on<=(clock_timestamp() at time zone o.time_zone)::date
        and (m.ends_on is null or m.ends_on>=(clock_timestamp() at time zone o.time_zone)::date)
        and a.invitation_send_at<=clock_timestamp() and a.deleted_at is null and not a.leaders_only
        order by a.starts_at,a.id
    """).param("subject", subject).param("id", id).query(FollowerMatch::class.java).list().map { requireNotNull(it) }
}
