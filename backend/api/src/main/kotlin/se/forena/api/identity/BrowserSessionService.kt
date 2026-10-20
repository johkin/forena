package se.forena.api.identity

import java.security.MessageDigest
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication
import org.springframework.security.oauth2.jwt.JwtDecoder
import org.springframework.stereotype.Service
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.transaction.support.TransactionTemplate
import se.forena.api.identity.internal.BrowserAuthProvider
import tools.jackson.databind.JsonNode

/** Shared JDBC row locks serialize refresh across all application instances. */
@Service
@ConditionalOnWebApplication
class BrowserSessionService(
    private val jdbc: JdbcTemplate, private val transaction: TransactionTemplate,
    private val settings: BrowserSessionSettings, private val provider: BrowserAuthProvider,
    private val decoder: JwtDecoder, private val active: SessionService
) {
    fun login(email: String, password: String, previous: String?): String {
        settings.requireEnabled()
        if (email.length !in 3..320 || password.length !in 1..1024) throw InactiveSession()
        return create(provider.password(email, password), previous)
    }
    fun passkeyOptions(): JsonNode { settings.requireEnabled(); return provider.options() }
    fun passkeyVerify(challenge: String, credential: JsonNode, previous: String?) = create(provider.verify(challenge, credential), previous)

    private fun create(tokens: JsonNode, previous: String?): String {
        val access = text(tokens, "access_token")
        val refresh = text(tokens, "refresh_token")
        val jwt = decoder.decode(access)
        active.requireActive(actor(jwt))
        val id = settings.randomId()
        val hash = hash(id)
        val now = Instant.now()
        transaction.executeWithoutResult {
            purge()
            if (previous != null) delete(previous)
            jdbc.update("""insert into forena.browser_session(id_hash,subject,provider_session,tokens,access_expires_at,expires_at,idle_expires_at)
                values(?,?,?,?,?,?,?)""", hash, UUID.fromString(jwt.subject), UUID.fromString(jwt.getClaimAsString("session_id")),
                settings.encrypt(access + "\n" + refresh, hash), Timestamp.from(jwt.expiresAt),
                Timestamp.from(now.plusSeconds(settings.maxSeconds)), Timestamp.from(now.plusSeconds(settings.idleSeconds)))
        }
        return id
    }

    fun resolve(id: String): BrowserSessionToken? {
        settings.requireEnabled()
        if (!id.matches(Regex("[A-Za-z0-9_-]{43}"))) return null
        // Return an expired result rather than throwing inside the transaction: deletion must commit.
        return transaction.execute {
            val hash = hash(id)
            val rows = jdbc.queryForList("select * from forena.browser_session where id_hash=? for update", hash)
            val row = rows.singleOrNull() ?: return@execute null
            val now = Instant.now()
            fun expired(column: String) = !(row[column] as Timestamp).toInstant().isAfter(now)
            if (expired("expires_at") || expired("idle_expires_at")) {
                delete(id); return@execute null
            }
            val tokens = settings.decrypt(row["tokens"] as String, hash).split('\n', limit = 2)
            var access = tokens[0]
            if (!(row["access_expires_at"] as Timestamp).toInstant().isAfter(now.plusSeconds(60))) {
                try {
                    val renewed = provider.refresh(tokens[1])
                    access = text(renewed, "access_token")
                    val jwt = decoder.decode(access)
                    if (UUID.fromString(jwt.subject) != row["subject"] || UUID.fromString(jwt.getClaimAsString("session_id")) != row["provider_session"])
                        throw InactiveSession()
                    jdbc.update("update forena.browser_session set tokens=?,access_expires_at=? where id_hash=?",
                        settings.encrypt(access + "\n" + text(renewed, "refresh_token"), hash), Timestamp.from(jwt.expiresAt), hash)
                } catch (_: InactiveSession) { delete(id); return@execute null }
            }
            jdbc.update("update forena.browser_session set idle_expires_at=least(expires_at,?) where id_hash=?",
                Timestamp.from(now.plusSeconds(settings.idleSeconds)), hash)
            BrowserSessionToken(access, row["subject"] as UUID)
        }
    }

    fun current(token: String): BrowserSessionView {
        val jwt = decoder.decode(token)
        active.requireActive(actor(jwt))
        return BrowserSessionView(BrowserUser(jwt.subject ?: throw InactiveSession(), jwt.getClaimAsString("email")))
    }

    /** Local deletion commits before contacting Auth, even when Auth is unavailable. */
    fun logout(id: String?) {
        if (id == null) return
        val token = transaction.execute {
            val hash = hash(id)
            val rows = jdbc.queryForList("select tokens from forena.browser_session where id_hash=? for update", hash)
            delete(id)
            rows.singleOrNull()?.let {
                // Key rotation or corrupt ciphertext must not prevent local logout.
                try { settings.decrypt(it["tokens"] as String, hash).substringBefore('\n') }
                catch (_: InactiveSession) { null }
            }
        }
        if (token != null) {
            try { provider.logout(token) } catch (_: InactiveSession) {} catch (_: SessionVerificationUnavailable) {}
        }
    }
    @Scheduled(fixedDelay = 60000)
    fun purge() {
        if (settings.enabled) jdbc.update("delete from forena.browser_session where expires_at<=clock_timestamp() or idle_expires_at<=clock_timestamp()")
    }
    private fun delete(id: String) { jdbc.update("delete from forena.browser_session where id_hash=?", hash(id)) }
    private fun hash(id: String) = MessageDigest.getInstance("SHA-256").digest(id.toByteArray()).joinToString("") { "%02x".format(it) }
    private fun text(node: JsonNode, name: String): String = node.get(name)?.takeIf { it.isString }?.asString()?.takeIf { it.isNotBlank() && !it.contains('\n') }
        ?: throw SessionVerificationUnavailable()
    private fun actor(jwt: org.springframework.security.oauth2.jwt.Jwt) = Actor(UUID.fromString(jwt.subject), UUID.fromString(jwt.getClaimAsString("session_id")), jwt.tokenValue)
}
