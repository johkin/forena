package se.forena.api.identity

import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import java.util.UUID
import org.springframework.beans.factory.annotation.Value
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.authentication.BadCredentialsException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import se.forena.api.identity.authentication.AccountService

data class TelegramConnection(
    val id: UUID,
    val subject: UUID,
    val telegramUserId: Long,
    val chatId: Long,
    val authVersion: Long,
)

data class TelegramSettings(
    val active: Boolean,
    val available: Boolean,
    val pairingUrl: String? = null,
    val pairingExpiresAt: Long? = null,
)

data class TelegramSettingsChange(val operation: String, val consent: Boolean = false)

/**
 * Only this service can construct a Telegram actor; every command revalidates its link generation.
 */
@Service
class TelegramIdentityService(
    private val jdbc: JdbcClient,
    private val accounts: AccountService,
    private val clock: DatabaseClockService,
    @Value("\${FORENA_TELEGRAM_ENABLED:false}") private val enabled: Boolean,
    @Value("\${FORENA_TELEGRAM_BOT_USERNAME:}") private val username: String,
) {
    private val random = SecureRandom()

    fun available() = enabled && username.matches(Regex("[A-Za-z0-9_]{5,32}"))

    @Transactional(readOnly = true)
    fun settings(subject: UUID) =
        TelegramSettings(connectionForSubject(subject) != null, available())

    @Transactional
    fun start(subject: UUID, consent: Boolean): TelegramSettings {
        check(available())
        require(consent)
        accounts.requireUser(subject)
        jdbc
            .sql("select subject from forena.account where subject=:subject for update")
            .param("subject", subject)
            .query(UUID::class.java)
            .single()
        val existing = settings(subject)
        if (existing.active) return existing
        jdbc
            .sql("delete from forena.telegram_pairing where subject=:subject or expires_at<=:now")
            .param("subject", subject)
            .param("now", java.sql.Timestamp.from(clock.now()))
            .update()
        val proof = proof()
        val expiry = clock.now().plusSeconds(600)
        jdbc
            .sql(
                "insert into forena.telegram_pairing(fingerprint,subject,expires_at) values(:hash,:subject,:expiry)"
            )
            .param("hash", fingerprint(proof))
            .param("subject", subject)
            .param("expiry", java.sql.Timestamp.from(expiry))
            .update()
        return TelegramSettings(
            false,
            true,
            "https://t.me/$username?start=$proof",
            expiry.toEpochMilli(),
        )
    }

    @Transactional
    fun connect(proof: String, user: Long, chat: Long, update: Long): TelegramConnection {
        check(available())
        require(user > 0 && user == chat && proof.matches(Regex("[A-Za-z0-9_-]{43}")))
        val subject =
            jdbc
                .sql(
                    "delete from forena.telegram_pairing where fingerprint=:hash and expires_at>:now returning subject"
                )
                .param("hash", fingerprint(proof))
                .param("now", java.sql.Timestamp.from(clock.now()))
                .query(UUID::class.java)
                .optional()
                .orElseThrow { BadCredentialsException("Invalid pairing") }
        jdbc
            .sql("select subject from forena.account where subject=:subject for update")
            .param("subject", subject)
            .query(UUID::class.java)
            .single()
        val account = accounts.requireUser(subject)
        check(connectionForSubject(subject) == null)
        val id = UUID.randomUUID()
        jdbc
            .sql(
                "insert into forena.telegram_link(id,subject,telegram_user_id,chat_id,auth_version,last_update) values(:id,:subject,:user,:chat,:version,:update)"
            )
            .param("id", id)
            .param("subject", subject)
            .param("user", user)
            .param("chat", chat)
            .param("version", account.authVersion)
            .param("update", update)
            .update()
        jdbc
            .sql("delete from forena.telegram_pairing where subject=:subject")
            .param("subject", subject)
            .update()
        return TelegramConnection(id, subject, user, chat, account.authVersion)
    }

    @Transactional
    fun disconnect(subject: UUID) {
        jdbc
            .sql("select subject from forena.account where subject=:subject for update")
            .param("subject", subject)
            .query(UUID::class.java)
            .single()
        jdbc
            .sql("delete from forena.telegram_pairing where subject=:subject")
            .param("subject", subject)
            .update()
        jdbc
            .sql("delete from forena.telegram_link where subject=:subject")
            .param("subject", subject)
            .update()
        jdbc
            .sql(
                "update forena.assistant_proposal set state='invalid' where subject=:subject and state='pending' and conversation_id in (select id from forena.assistant_conversation where subject=:subject and channel='telegram')"
            )
            .param("subject", subject)
            .update()
        jdbc
            .sql(
                "update forena.assistant_conversation set active=false where subject=:subject and channel='telegram'"
            )
            .param("subject", subject)
            .update()
    }

    fun connection(user: Long, chat: Long): TelegramConnection? =
        if (user <= 0 || user != chat) null
        else
            jdbc
                .sql(
                    "select id,subject,telegram_user_id,chat_id,auth_version from forena.telegram_link where telegram_user_id=:user and chat_id=:chat"
                )
                .param("user", user)
                .param("chat", chat)
                .query(TelegramConnection::class.java)
                .optional()
                .orElse(null)

    fun connectionForSubject(subject: UUID): TelegramConnection? =
        jdbc
            .sql(
                "select id,subject,telegram_user_id,chat_id,auth_version from forena.telegram_link where subject=:subject"
            )
            .param("subject", subject)
            .query(TelegramConnection::class.java)
            .optional()
            .orElse(null)

    fun actor(connection: TelegramConnection): Actor {
        val actor = Actor(connection.subject, connection.id, "", telegram = true)
        requireActive(actor)
        return actor
    }

    fun requireActive(actor: Actor) {
        check(actor.telegram)
        val link = connectionForSubject(actor.subject)
        if (
            !enabled ||
                link == null ||
                link.id != actor.session ||
                accounts.requireUser(actor.subject).authVersion != link.authVersion
        )
            throw BadCredentialsException("Inactive Telegram connection")
    }

    @Transactional
    fun advance(connection: TelegramConnection, update: Long): Boolean =
        jdbc
            .sql(
                "update forena.telegram_link set last_update=:update where id=:id and last_update<:update"
            )
            .param("update", update)
            .param("id", connection.id)
            .update() == 1

    fun proof(): String =
        Base64.getUrlEncoder()
            .withoutPadding()
            .encodeToString(ByteArray(32).also(random::nextBytes))

    fun fingerprint(value: String): String =
        MessageDigest.getInstance("SHA-256").digest(value.toByteArray()).joinToString("") {
            "%02x".format(it)
        }
}
