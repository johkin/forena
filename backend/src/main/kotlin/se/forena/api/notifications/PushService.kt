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
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import se.forena.api.identity.Actor
import se.forena.api.identity.SessionService
import se.forena.api.notifications.internal.PushRepository
import tools.jackson.databind.json.JsonMapper

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
    private val repository: PushRepository,
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
        val existing = repository.findLockedEndpointOwner(command.endpoint).orElse(null)
        // A new logged-in account cannot claim a previous account's device endpoint.
        require(existing == null || existing == actor.subject)
        repository.saveSubscription(actor.subject, command.endpoint, keys.p256dh, keys.auth)
    }

    fun disable(actor: Actor, command: PushCommand) {
        sessions.requireActive(actor)
        repository.disableEndpoint(actor.subject, command.endpoint)
    }

    override fun deliver(notificationId: UUID): Boolean {
        if (!settings().available) return false
        val recipient = repository.notificationRecipient(notificationId)
        val subscriptions = repository.findActiveSubscriptions(recipient)
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
                    repository.claimDelivery(notificationId, subscription.id) == 1
                } == true
            if (!claimed) {
                accepted = accepted || repository.wasAccepted(notificationId, subscription.id)
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
                repository.finishDelivery(
                    if (status in 200..299) "accepted" else "failed",
                    notificationId,
                    subscription.id,
                )
                if (status in listOf(404, 410)) repository.disableSubscription(subscription.id)
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
