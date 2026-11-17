package se.forena.api.identity.internal

import java.sql.Timestamp
import java.time.Instant
import java.util.UUID
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import se.forena.api.identity.AccountClub


@Repository
class AccountLifecycleRepository(private val jdbc: JdbcClient) {
    fun ensure(subject: UUID) {
        jdbc.sql("insert into forena.account_lifecycle(subject) values(:subject) on conflict do nothing").param("subject", subject).update()
    }
    fun lock(subject: UUID): AccountLifecycleRow = jdbc.sql("""select activated_at,disconnected_at,reminder_sent,connection_until
        from forena.account_lifecycle where subject=:subject for update""")
        .param("subject", subject).query(AccountLifecycleRow::class.java).single()
    fun connections(subject: UUID): List<AccountConnection> = jdbc.sql(CONNECTIONS)
        .param("subject", subject).query(AccountConnection::class.java).list().map { requireNotNull(it) }
    fun platform(subject: UUID): Boolean = jdbc.sql("select exists(select 1 from forena.platform_administrator where subject=:subject)")
        .param("subject", subject).query(Boolean::class.java).single()
    fun connected(subject: UUID, now: Instant, until: Instant) {
        jdbc.sql("""update forena.account_lifecycle set activated_at=coalesce(activated_at,:now),disconnected_at=null,
            reminder_sent=false,connection_until=:until where subject=:subject""")
            .param("subject", subject).param("now", Timestamp.from(now)).param("until", Timestamp.from(until)).update()
    }
    fun disconnect(subject: UUID, at: Instant) {
        jdbc.sql("update forena.account_lifecycle set disconnected_at=:at,reminder_sent=false where subject=:subject")
            .param("subject", subject).param("at", Timestamp.from(at)).update()
    }
    fun reminded(subject: UUID) {
        jdbc.sql("update forena.account_lifecycle set reminder_sent=true where subject=:subject").param("subject", subject).update()
    }
    fun checked(subject: UUID, now: Instant) {
        jdbc.sql("update forena.account_lifecycle set checked_at=:now where subject=:subject")
            .param("now", Timestamp.from(now)).param("subject", subject).update()
    }
    fun subjects(): List<UUID> = jdbc.sql("""
        select u.subject from forena.native_user u left join forena.account_lifecycle l on l.subject=u.subject
        where u.verified order by case
            when l.disconnected_at+interval '30 days'<=clock_timestamp() then 0
            when not l.reminder_sent and l.disconnected_at+interval '23 days'<=clock_timestamp() then 1
            when l.disconnected_at is null and l.connection_until<=clock_timestamp() then 2
            else 3 end,coalesce(l.checked_at,'-infinity'::timestamptz),u.subject limit 100
    """)
        .query(UUID::class.java).list().map { requireNotNull(it) }
    fun erase(subject: UUID, now: Instant) {
        // Keep only the disabled opaque actor key required by shared club history FKs.
        val commands = listOf(
            "delete from forena.spring_session where principal_name=:text",
            "delete from forena.browser_session where subject=:subject",
            "delete from forena.oauth2_authorization where principal_name=:text",
            "delete from forena.oauth2_authorization_consent where principal_name=:text",
            "delete from forena.user_entities where name=:text",
            "delete from forena.one_time_tokens where username like '%:' || :text || ':%'",
            "delete from forena.telegram_pairing where subject=:subject",
            "delete from forena.telegram_link where subject=:subject",
            "delete from forena.assistant_conversation where subject=:subject",
            "delete from forena.assistant_memory where subject=:subject",
            "delete from forena.assistant_usage where subject=:subject",
            "delete from forena.account_email_change where subject=:subject",
            "delete from forena.account_child_link where subject=:subject",
            "delete from forena.account_follower where subject=:subject",
            "delete from forena.auth_mail_outbox where recipient in (select email from forena.native_user where subject=:subject)",
            "update forena.push_subscription set active=false,endpoint='deleted:' || id::text,p256dh='',auth='' where subject=:subject",
            "delete from forena.native_user where subject=:subject",
            "update forena.person_access set active=false,contact_name='',contact_phone='' where subject=:subject",
            "update forena.account set enabled=false,display_name='',phone='' where subject=:subject",
            "update forena.account_lifecycle set deleted_at=:now where subject=:subject",
        )
        commands.forEach { sql ->
            var query = jdbc.sql(sql)
            if (sql.contains(":subject")) query = query.param("subject", subject)
            if (sql.contains(":text")) query = query.param("text", subject.toString())
            if (sql.contains(":now")) query = query.param("now", Timestamp.from(now))
            query.update()
        }
    }
    companion object {
        // Finite connection expiries allow a delayed worker to retain the actual birthday/end-date deadline.
        private const val CONNECTIONS = """
            with links as (
                select o.id,o.name,
                    case when a.kind='guardian' then coalesce((p.birth_date+interval '18 years') at time zone o.time_zone,'9999-12-31'::timestamptz)
                         else '9999-12-31'::timestamptz end as until
                from forena.person_access a join forena.person p on p.id=a.person_id and p.organization_id=a.organization_id
                join forena.organization o on o.id=a.organization_id
                where a.subject=:subject and a.active and (a.kind='self' or
                    (p.birth_date is null or p.birth_date+interval '18 years'>(clock_timestamp() at time zone o.time_zone)::date))
                union all
                select o.id,o.name,'9999-12-31'::timestamptz from forena.organization_member m
                    join forena.organization o on o.id=m.organization_id where m.subject=:subject and m.active
                union all
                select o.id,o.name,'9999-12-31'::timestamptz from forena.section_administrator s
                    join forena.organization o on o.id=s.organization_id where s.subject=:subject and s.active
                union all
                select o.id,o.name,coalesce((d.ends_on+1)::timestamp at time zone o.time_zone,'9999-12-31'::timestamptz)
                    from forena.team_administrator d join forena.organization o on o.id=d.organization_id
                    join forena.person_access a on a.person_id=d.person_id and a.subject=d.subject and a.active and a.kind='self'
                    where d.subject=:subject and d.active and d.starts_on<=(clock_timestamp() at time zone o.time_zone)::date
                    and (d.ends_on is null or d.ends_on>=(clock_timestamp() at time zone o.time_zone)::date)
                union all
                select o.id,o.name,'9999-12-31'::timestamptz
                    from forena.account_follower f join forena.organization o on o.id=f.organization_id
                    join forena.person_access own on own.person_id=f.person_id and own.organization_id=o.id and own.kind='self' and own.active
                    where f.subject=:subject and f.state='approved'
            ) select id,name,max(until) as until from links group by id,name order by name,id
        """
    }
}
