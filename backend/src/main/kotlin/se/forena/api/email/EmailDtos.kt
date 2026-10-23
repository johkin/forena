package se.forena.api.email

data class EmailMessage(val to: String, val subject: String, val text: String, val idempotencyKey: String)

sealed interface EmailDeliveryResult {
    data class Accepted(val messageId: String) : EmailDeliveryResult
    data class Retry(val afterSeconds: Long = 0) : EmailDeliveryResult
    data object Rejected : EmailDeliveryResult
}
