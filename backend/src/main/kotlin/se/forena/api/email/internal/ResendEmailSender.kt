package se.forena.api.email.internal

import org.springframework.http.MediaType
import org.springframework.web.client.ResourceAccessException
import org.springframework.web.client.RestClient
import se.forena.api.email.EmailDeliveryResult
import se.forena.api.email.EmailMessage
import se.forena.api.email.EmailSender
import tools.jackson.databind.json.JsonMapper

/** No provider body or transport exception escapes: both can contain recipient data and links. */
class ResendEmailSender(private val client: RestClient, private val json: JsonMapper,
                        private val apiKey: String, private val from: String) : EmailSender {
    init {
        require(apiKey.isNotBlank() && apiKey.none { it.isWhitespace() }) { "Configure RESEND_API_KEY" }
        require(from.contains('@') && from.none { it == '\r' || it == '\n' }) { "Configure RESEND_FROM_EMAIL" }
    }

    override fun send(message: EmailMessage): EmailDeliveryResult {
        require(message.idempotencyKey.matches(Regex("[A-Za-z0-9_/-]{1,256}"))) { "Invalid email idempotency key" }
        return try {
            client.post().uri("https://api.resend.com/emails")
                .contentType(MediaType.APPLICATION_JSON)
                .headers { it.setBearerAuth(apiKey); it.set("Idempotency-Key", message.idempotencyKey) }
                .body(mapOf("from" to from, "to" to listOf(message.to), "subject" to message.subject, "text" to message.text))
                .exchange { _, response ->
                    when {
                        response.statusCode.is2xxSuccessful -> {
                            val id = runCatching { json.readTree(response.body).get("id")?.asString() }.getOrNull()
                            if (id.isNullOrBlank()) EmailDeliveryResult.Retry() else EmailDeliveryResult.Accepted(id)
                        }
                        response.statusCode.value() == 409 -> {
                            val name = runCatching { json.readTree(response.body).get("name")?.asString() }.getOrNull()
                            if (name in listOf("concurrent_idempotent_requests", "resource_locked")) EmailDeliveryResult.Retry()
                            else EmailDeliveryResult.Rejected
                        }
                        response.statusCode.value() in listOf(408, 429) || response.statusCode.is5xxServerError ->
                            EmailDeliveryResult.Retry(response.headers.getFirst("Retry-After")?.toLongOrNull()?.coerceIn(0, 86400) ?: 0)
                        else -> EmailDeliveryResult.Rejected
                    }
                }!!
        } catch (_: ResourceAccessException) {
            EmailDeliveryResult.Retry()
        }
    }
}
