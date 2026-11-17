package se.forena.api.identity.internal

import java.sql.Timestamp
import java.time.Instant
import java.util.UUID
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import se.forena.api.identity.AccountSessionView

@Repository
class AccountSecurityRepository(private val jdbc: JdbcClient) {
    fun activeSession(subject: UUID, session: String, maxSeconds: Long): Boolean = jdbc.sql("""
        select exists(select 1 from forena.spring_session s where s.session_id=:session and s.principal_name=:subject
            and s.expiry_time>extract(epoch from clock_timestamp())*1000
            and s.creation_time+:maxMillis>extract(epoch from clock_timestamp())*1000
            and not exists(select 1 from forena.revoked_session r where r.id::text=s.session_id and r.subject::text=:subject))
    """).param("session", session).param("subject", subject.toString()).param("maxMillis", maxSeconds * 1000).query(Boolean::class.java).single()
    fun sessions(subject: UUID, current: String, maxSeconds: Long): List<AccountSessionView> = jdbc.sql("""
        select s.session_id as id,coalesce(convert_from(device.attribute_bytes,'UTF8'),s.device_label) as device,to_timestamp(s.last_access_time/1000.0) as last_active_at,
            (s.session_id=:current) as current from forena.spring_session s
        join forena.native_user u on u.subject::text=s.principal_name
        join forena.spring_session_attributes identity on identity.session_primary_id=s.primary_id and identity.attribute_name='forena.auth-identity'
        left join forena.spring_session_attributes device on device.session_primary_id=s.primary_id and device.attribute_name='forena.device-label'
        where convert_from(identity.attribute_bytes,'UTF8')=u.subject::text || chr(10) || u.auth_version::text and s.principal_name=:subject and s.expiry_time>extract(epoch from clock_timestamp())*1000
            and s.creation_time+:maxMillis>extract(epoch from clock_timestamp())*1000
            and not exists(select 1 from forena.revoked_session r where r.id::text=s.session_id and r.subject::text=:subject)
        order by s.last_access_time desc
    """).param("subject", subject.toString()).param("current", current).param("maxMillis", maxSeconds * 1000)
        .query(AccountSessionView::class.java).list().map { requireNotNull(it) }
    fun device(session: String, label: String) {
        jdbc.sql("update forena.spring_session set device_label=:label where session_id=:session")
            .param("session", session).param("label", label).update()
    }
    fun revoke(subject: UUID, current: String, id: String?) {
        val clause = if (id == null) "session_id<>:current" else "session_id=:id"
        var insert = jdbc.sql("""insert into forena.revoked_session(id,subject)
            select session_id::uuid,:subject from forena.spring_session where principal_name=:text and $clause on conflict do nothing""")
            .param("subject", subject).param("text", subject.toString())
        insert = if (id == null) insert.param("current", current) else insert.param("id", id)
        insert.update()
        var delete = jdbc.sql("delete from forena.spring_session where principal_name=:text and $clause").param("text", subject.toString())
        delete = if (id == null) delete.param("current", current) else delete.param("id", id)
        delete.update()
    }
    fun password(subject: UUID, hash: String) {
        jdbc.sql("update forena.native_user set password_hash=:hash,auth_version=auth_version+1 where subject=:subject")
            .param("hash", hash).param("subject", subject).update()
    }
    fun emailRequest(subject: UUID, email: String, hash: String, session: String, version: Long, expires: Instant) {
        jdbc.sql("""insert into forena.account_email_change(subject,email,fingerprint,session_id,auth_version,expires_at)
            values(:subject,:email,:hash,:session,:version,:expires) on conflict(subject) do update set
            email=excluded.email,fingerprint=excluded.fingerprint,session_id=excluded.session_id,
            auth_version=excluded.auth_version,expires_at=excluded.expires_at""")
            .param("subject", subject).param("email", email).param("hash", hash).param("session", session)
            .param("version", version).param("expires", Timestamp.from(expires)).update()
    }
    fun pendingEmail(subject: UUID, hash: String): PendingEmail? = jdbc.sql("""
        select email,auth_version,session_id,expires_at from forena.account_email_change
        where subject=:subject and fingerprint=:hash for update
    """).param("subject", subject).param("hash", hash).query(PendingEmail::class.java).optional().orElse(null)
    fun cancelEmail(subject: UUID) {
        jdbc.sql("delete from forena.account_email_change where subject=:subject").param("subject", subject).update()
    }
    fun changeEmail(subject: UUID, email: String) {
        jdbc.sql("update forena.native_user set email=:email,auth_version=auth_version+1 where subject=:subject")
            .param("email", email).param("subject", subject).update()
    }
    fun renamePasskey(subject: UUID, id: String, label: String): Int = jdbc.sql("""
        update forena.user_credentials c set label=:label from forena.user_entities u
        where u.id=c.user_entity_user_id and u.name=:subject and c.credential_id=:id
    """).param("subject", subject.toString()).param("id", id).param("label", label).update()
}
