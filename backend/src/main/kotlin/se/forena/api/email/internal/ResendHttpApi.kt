package se.forena.api.email.internal

import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.service.annotation.HttpExchange
import org.springframework.web.service.annotation.PostExchange

data class ResendEmailRequest(
    val from: String,
    val to: List<String>,
    val subject: String,
    val text: String,
)

@HttpExchange(url = "https://api.resend.com", contentType = MediaType.APPLICATION_JSON_VALUE)
interface ResendHttpApi {
    // Preserve the status and raw body so malformed successes and 409 variants are classified
    // safely.
    @PostExchange("/emails")
    fun send(
        @RequestHeader("Idempotency-Key") idempotencyKey: String,
        @RequestBody message: ResendEmailRequest,
    ): ResponseEntity<String>
}
