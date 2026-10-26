package se.forena.api.email.internal

import org.springframework.web.client.ResourceAccessException
import se.forena.api.email.EmailDeliveryResult
import se.forena.api.email.EmailMessage
import se.forena.api.email.EmailSender
import tools.jackson.databind.json.JsonMapper

/** No provider body or transport exception escapes: both can contain recipient data and links. */
class ResendEmailSender(
    private val api: ResendHttpApi,
    private val json: JsonMapper,
    private val from: String,
) : EmailSender {
    init {
        require(from.contains('@') && from.none { it == '\r' || it == '\n' }) {
            "Configure RESEND_FROM_EMAIL"
        }
    }

    override fun send(message: EmailMessage): EmailDeliveryResult {
        require(message.idempotencyKey.matches(Regex("[A-Za-z0-9_/-]{1,256}"))) {
            "Invalid email idempotency key"
        }
        return try {
            val response =
                api.send(
                    message.idempotencyKey,
                    ResendEmailRequest(from, listOf(message.to), message.subject, message.text),
                )
            when {
                response.statusCode.is2xxSuccessful -> {
                    val id = field(response.body, "id")
                    if (id.isNullOrBlank()) EmailDeliveryResult.Retry()
                    else EmailDeliveryResult.Accepted(id)
                }
                response.statusCode.value() == 409 -> {
                    if (
                        field(response.body, "name") in
                            listOf("concurrent_idempotent_requests", "resource_locked")
                    ) {
                        EmailDeliveryResult.Retry()
                    } else {
                        EmailDeliveryResult.Rejected
                    }
                }
                response.statusCode.value() in listOf(408, 429) ||
                    response.statusCode.is5xxServerError -> {
                    val delay =
                        response.headers.getFirst("Retry-After")?.toLongOrNull()?.coerceIn(0, 86400)
                            ?: 0
                    EmailDeliveryResult.Retry(delay)
                }
                else -> EmailDeliveryResult.Rejected
            }
        } catch (_: ResourceAccessException) {
            EmailDeliveryResult.Retry()
        }
    }

    private fun field(body: String?, name: String): String? = runCatching {
        json.readTree(body ?: "").get(name)?.asString()
    }.getOrNull()
}
