package se.forena.api.identity.authentication

import java.sql.Timestamp
import java.time.Instant
import java.util.UUID
import org.slf4j.LoggerFactory
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import se.forena.api.email.EmailDeliveryResult
import se.forena.api.email.EmailMessage
import se.forena.api.email.EmailSender
import se.forena.api.identity.BrowserSessionSettings

/** Durable transactional delivery; encrypted links at rest. Only the local email adapter logs links. */
@Service
class AuthMailService(private val jdbc: JdbcTemplate, private val transaction: TransactionTemplate,
    private val sender: EmailSender, private val settings: BrowserSessionSettings) {
    private val logger = LoggerFactory.getLogger(AuthMailService::class.java)

    fun enqueue(email: String, kind: String, link: String, expires: Instant) {
        val id = UUID.randomUUID()
        jdbc.update("insert into forena.auth_mail_outbox(id,recipient,kind,encrypted_link,expires_at) values(?,?,?,?,?)",
            id, email, kind, settings.encrypt(link, id.toString()), Timestamp.from(expires))
    }
    @Scheduled(fixedDelayString = "\${forena.authentication.mail-delay-ms:15000}")
    fun deliver() {
        jdbc.update("delete from forena.auth_mail_outbox where expires_at < now() or delivered_at < now() - interval '1 day'")
        repeat(10) {
            val found = transaction.execute {
                val rows = jdbc.queryForList("select id,recipient,kind,encrypted_link from forena.auth_mail_outbox where delivered_at is null and next_attempt<=now() and expires_at>now() and attempts<5 order by next_attempt for update skip locked limit 1")
                val row = rows.firstOrNull() ?: return@execute false
                val id = row["id"].toString()
                val title = when (row["kind"]) { "verify" -> "Verifiera din e-postadress"; "reset" -> "Återställ ditt lösenord"; else -> "Logga in" }
                val link = settings.decrypt(row["encrypted_link"].toString(), id)
                val message = EmailMessage(row["recipient"].toString(), "$title i Förena",
                    "$title genom att öppna länken nedan. Länken gäller i tio minuter och kan användas en gång.\n\n$link\n\nÖppna inloggningslänken i samma webbläsare som begärde den. Om du inte begärde detta kan du ignorera mejlet.",
                    "native-auth/$id")
                when (val result = sender.send(message)) {
                    is EmailDeliveryResult.Accepted ->
                        jdbc.update("update forena.auth_mail_outbox set delivered_at=now(),encrypted_link='' where id=?", UUID.fromString(id))
                    is EmailDeliveryResult.Retry ->
                        jdbc.update("update forena.auth_mail_outbox set attempts=attempts+1,next_attempt=now()+interval '1 second' * greatest(30 * power(2,attempts),?) where id=?", result.afterSeconds, UUID.fromString(id))
                    EmailDeliveryResult.Rejected -> {
                        jdbc.update("update forena.auth_mail_outbox set attempts=5,encrypted_link='' where id=?", UUID.fromString(id))
                        logger.warn("auth_mail_rejected")
                    }
                }
                true
            }
            if (!found) return
        }
    }
}
