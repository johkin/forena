package se.forena.api.identity

import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import java.util.UUID
import org.springframework.beans.factory.annotation.Value
import org.springframework.security.authentication.BadCredentialsException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import se.forena.api.identity.authentication.AccountService
import se.forena.api.identity.internal.TelegramIdentityRepository

/**
 * Only this service can construct a Telegram actor; every command revalidates its link generation.
 */
@Service
class TelegramIdentityService(
    private val repository: TelegramIdentityRepository,
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
        repository.lockAccount(subject)
        val existing = settings(subject)
        if (existing.active) return existing
        repository.deleteExpiredPairings(subject, clock.now())
        val proof = proof()
        val expiry = clock.now().plusSeconds(600)
        repository.createPairing(fingerprint(proof), subject, expiry)
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
            repository.consumePairing(fingerprint(proof), clock.now()).orElseThrow {
                BadCredentialsException("Invalid pairing")
            }
        repository.lockAccount(subject)
        val account = accounts.requireUser(subject)
        check(connectionForSubject(subject) == null)
        val id = UUID.randomUUID()
        repository.createConnection(id, subject, user, chat, account.authVersion, update)
        repository.deletePairings(subject)
        return TelegramConnection(id, subject, user, chat, account.authVersion)
    }

    @Transactional
    fun disconnect(subject: UUID) {
        repository.lockAccount(subject)
        repository.deletePairings(subject)
        repository.deleteConnection(subject)
        repository.invalidateProposals(subject)
        repository.archiveConversations(subject)
    }

    fun connection(user: Long, chat: Long): TelegramConnection? =
        if (user <= 0 || user != chat) null else repository.findConnection(user, chat).orElse(null)

    fun connectionForSubject(subject: UUID): TelegramConnection? =
        repository.findConnectionForSubject(subject).orElse(null)

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
        repository.advanceUpdate(update, connection.id) == 1

    fun proof(): String =
        Base64.getUrlEncoder()
            .withoutPadding()
            .encodeToString(ByteArray(32).also(random::nextBytes))

    fun fingerprint(value: String): String =
        MessageDigest.getInstance("SHA-256").digest(value.toByteArray()).joinToString("") {
            "%02x".format(it)
        }
}
