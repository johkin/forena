package se.forena.api.identity.nativeauth

import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.mail.MailException
import org.springframework.mail.SimpleMailMessage
import org.springframework.mail.javamail.JavaMailSender
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import se.forena.api.identity.BrowserSessionSettings
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID

/** Durable transactional delivery; links are encrypted at rest and never logged. SMTP remains external. */
@Service
@ConditionalOnProperty(name = ["forena.auth.mode"], havingValue = "native")
class NativeAuthMailService(private val jdbc: JdbcTemplate, private val transaction: TransactionTemplate,
    private val sender: JavaMailSender, private val settings: BrowserSessionSettings,
    @Value("\${forena.native-auth.mail-from:}") private val from: String) {
    init { require(from.contains('@') && from.none { it == '\r' || it == '\n' }) { "Configure FORENA_AUTH_MAIL_FROM" } }
    fun enqueue(email: String, kind: String, link: String, expires: Instant) {
        val id = UUID.randomUUID()
        jdbc.update("insert into forena.auth_mail_outbox(id,recipient,kind,encrypted_link,expires_at) values(?,?,?,?,?)",
            id, email, kind, settings.encrypt(link, id.toString()), Timestamp.from(expires))
    }
    @Scheduled(fixedDelayString = "\${forena.native-auth.mail-delay-ms:15000}")
    fun deliver() {
        jdbc.update("delete from forena.auth_mail_outbox where expires_at < now() or delivered_at < now() - interval '1 day'")
        repeat(10) {
            val found = transaction.execute {
                val rows = jdbc.queryForList("select id,recipient,kind,encrypted_link from forena.auth_mail_outbox where delivered_at is null and next_attempt<=now() and expires_at>now() and attempts<5 order by next_attempt for update skip locked limit 1")
                val row = rows.firstOrNull() ?: return@execute false
                val id = row["id"].toString()
                val title = when (row["kind"]) { "verify" -> "Verifiera din e-postadress"; "reset" -> "Återställ ditt lösenord"; else -> "Logga in" }
                val link = settings.decrypt(row["encrypted_link"].toString(), id)
                try {
                    val message = SimpleMailMessage()
                    message.setFrom(from); message.setTo(row["recipient"].toString()); message.subject = "$title i Förena"
                    message.text = "$title genom att öppna länken nedan. Länken gäller i tio minuter och kan användas en gång.\n\n$link\n\nÖppna inloggningslänken i samma webbläsare som begärde den. Om du inte begärde detta kan du ignorera mejlet."
                    sender.send(message)
                    jdbc.update("update forena.auth_mail_outbox set delivered_at=now(),encrypted_link='' where id=?", UUID.fromString(id))
                } catch (_: MailException) {
                    jdbc.update("update forena.auth_mail_outbox set attempts=attempts+1,next_attempt=now()+interval '30 seconds' * power(2,attempts) where id=?", UUID.fromString(id))
                }
                true
            } ?: false
            if (!found) return
        }
    }
}
