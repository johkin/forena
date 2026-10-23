package se.forena.api.email

/** Provider-independent delivery boundary. The caller owns persistence and retries. */
fun interface EmailSender {
    fun send(message: EmailMessage): EmailDeliveryResult
}
