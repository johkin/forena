package se.forena.api.notifications

import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.security.Security
import java.time.Duration
import java.util.Base64
import java.util.UUID
import org.bouncycastle.jce.provider.BouncyCastleProvider
import org.springframework.beans.factory.annotation.Value
import org.springframework.core.annotation.Order
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import se.forena.api.identity.Actor
import se.forena.api.identity.SessionService
import tools.jackson.databind.json.JsonMapper

// Subscription secrets are private transport data, never returned by a settings endpoint.
class PushSubscription(
    val id: UUID,
    val subject: UUID,
    val endpoint: String,
    val p256dh: String,
    val auth: String,
)

data class PushKeys(val p256dh: String, val auth: String)

data class PushCommand(val endpoint: String, val keys: PushKeys? = null)

data class PushSettings(val available: Boolean, val publicKey: String)

interface PushTransport {
    fun send(subscription: PushSubscription, payload: String): Int
}

@Service
class WebPushTransport(
    @Value("\${FORENA_VAPID_PUBLIC_KEY:}") private val publicKey: String,
    @Value("\${FORENA_VAPID_PRIVATE_KEY:}") private val privateKey: String,
    @Value("\${FORENA_VAPID_SUBJECT:}") private val subject: String,
) : PushTransport {
    private val http =
        HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(3))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build()

    override fun send(subscription: PushSubscription, payload: String): Int {
        if (Security.getProvider("BC") == null) Security.addProvider(BouncyCastleProvider())
        val encryption = PushEncryption(publicKey, privateKey, subject)
        val prepared =
            encryption.prepare(
                nl.martijndwars.webpush.Notification(
                    subscription.endpoint,
                    subscription.p256dh,
                    subscription.auth,
                    payload,
                )
            )
        val request = HttpRequest.newBuilder(URI(prepared.url)).timeout(Duration.ofSeconds(5))
        prepared.headers.forEach { (key, value) ->
            if (!key.equals("content-length", true)) request.header(key, value)
        }
        return http
            .send(
                request.POST(HttpRequest.BodyPublishers.ofByteArray(prepared.body)).build(),
                HttpResponse.BodyHandlers.discarding(),
            )
            .statusCode()
    }
}

@Service
@Order(1)
class PushService(
    private val jdbc: JdbcClient,
    private val sessions: SessionService,
    private val transaction: TransactionTemplate,
    private val transport: PushTransport,
    private val json: JsonMapper,
    @Value("\${FORENA_PUSH_ENABLED:false}") private val enabled: Boolean,
    @Value("\${FORENA_VAPID_PUBLIC_KEY:}") private val publicKey: String,
) : InvitationChannel {
    override val name = "push"

    fun settings() = PushSettings(enabled && publicKey.isNotBlank(), publicKey)

    fun subscribe(actor: Actor, command: PushCommand) = transaction.executeWithoutResult {
        sessions.requireActive(actor)
        check(settings().available)
        validateEndpoint(command.endpoint)
        val keys = requireNotNull(command.keys)
        require(
            Base64.getUrlDecoder().decode(keys.p256dh).size == 65 &&
                Base64.getUrlDecoder().decode(keys.auth).size == 16
        )
        val existing =
            jdbc
                .sql(
                    "select subject from forena.push_subscription where endpoint=:endpoint for update"
                )
                .param("endpoint", command.endpoint)
                .query(UUID::class.java)
                .optional()
                .orElse(null)
        // A new logged-in account cannot claim a previous account's device endpoint.
        require(existing == null || existing == actor.subject)
        jdbc
            .sql(
                """insert into forena.push_subscription(subject,endpoint,p256dh,auth) values(:subject,:endpoint,:p256dh,:auth)
            on conflict(endpoint) do update set p256dh=:p256dh,auth=:auth,active=true,updated_at=clock_timestamp()
            where forena.push_subscription.subject=:subject"""
            )
            .param("subject", actor.subject)
            .param("endpoint", command.endpoint)
            .param("p256dh", keys.p256dh)
            .param("auth", keys.auth)
            .update()
    }

    fun disable(actor: Actor, command: PushCommand) {
        sessions.requireActive(actor)
        jdbc
            .sql(
                "update forena.push_subscription set active=false where subject=:subject and endpoint=:endpoint"
            )
            .param("subject", actor.subject)
            .param("endpoint", command.endpoint)
            .update()
    }

    override fun deliver(notificationId: UUID): Boolean {
        if (!settings().available) return false
        val recipient =
            jdbc
                .sql("select recipient_subject from forena.invitation_notification where id=:id")
                .param("id", notificationId)
                .query(UUID::class.java)
                .single()
        val subscriptions =
            jdbc
                .sql(
                    "select id,subject,endpoint,p256dh,auth from forena.push_subscription where subject=:subject and active order by id limit 21"
                )
                .param("subject", recipient)
                .query(PushSubscription::class.java)
                .list()
                .map { requireNotNull(it) }
        if (subscriptions.size > 20) return false
        var accepted = false
        val payload =
            json.writeValueAsString(
                mapOf(
                    "title" to "Förena",
                    "body" to "Du har en ny kallelse eller påminnelse i Förena.",
                    "url" to "/notifications",
                    "tag" to notificationId.toString(),
                )
            )
        for (subscription in subscriptions) {
            val claimed =
                transaction.execute {
                    jdbc
                        .sql(
                            "insert into forena.push_delivery(notification_id,subscription_id,state) values(:id,:subscription,'uncertain') on conflict do nothing"
                        )
                        .param("id", notificationId)
                        .param("subscription", subscription.id)
                        .update() == 1
                } == true
            if (!claimed) {
                accepted =
                    accepted ||
                        jdbc
                            .sql(
                                "select state='accepted' from forena.push_delivery where notification_id=:id and subscription_id=:subscription"
                            )
                            .param("id", notificationId)
                            .param("subscription", subscription.id)
                            .query(Boolean::class.java)
                            .single()
                continue
            }
            val status =
                try {
                    validateEndpoint(subscription.endpoint)
                    transport.send(subscription, payload)
                } catch (_: InterruptedException) {
                    Thread.currentThread().interrupt()
                    503
                } catch (_: Exception) {
                    503
                }
            if (status in 200..299) accepted = true
            transaction.executeWithoutResult {
                jdbc
                    .sql(
                        "update forena.push_delivery set state=:state where notification_id=:id and subscription_id=:subscription"
                    )
                    .param("state", if (status in 200..299) "accepted" else "failed")
                    .param("id", notificationId)
                    .param("subscription", subscription.id)
                    .update()
                if (status in listOf(404, 410))
                    jdbc
                        .sql("update forena.push_subscription set active=false where id=:id")
                        .param("id", subscription.id)
                        .update()
            }
        }
        return accepted
    }

    private fun validateEndpoint(endpoint: String) {
        require(endpoint.length in 1..2048)
        val uri = URI(endpoint)
        val host = uri.host?.lowercase().orEmpty()
        require(
            uri.scheme == "https" &&
                uri.userInfo == null &&
                uri.port in listOf(-1, 443) &&
                uri.fragment == null
        )
        require(
            host == "fcm.googleapis.com" ||
                host == "updates.push.services.mozilla.com" ||
                host.endsWith(".push.services.mozilla.com") ||
                host == "web.push.apple.com" ||
                host.endsWith(".notify.windows.com")
        )
    }
}

internal class PushEncryption(publicKey: String, privateKey: String, subject: String) :
    nl.martijndwars.webpush.AbstractPushService<PushEncryption>(publicKey, privateKey, subject) {
    fun prepare(
        notification: nl.martijndwars.webpush.Notification
    ): nl.martijndwars.webpush.HttpRequest =
        prepareRequest(notification, nl.martijndwars.webpush.Encoding.AES128GCM)
}
