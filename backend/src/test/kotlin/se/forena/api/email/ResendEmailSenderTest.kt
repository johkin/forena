package se.forena.api.email

import java.net.SocketTimeoutException
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.springframework.http.HttpMethod
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.test.web.client.MockRestServiceServer
import org.springframework.test.web.client.match.MockRestRequestMatchers.*
import org.springframework.test.web.client.response.MockRestResponseCreators.*
import org.springframework.web.client.RestClient
import org.springframework.web.client.support.RestClientAdapter
import org.springframework.web.service.invoker.HttpServiceProxyFactory
import se.forena.api.email.internal.ResendEmailSender
import se.forena.api.email.internal.ResendHttpApi
import tools.jackson.databind.json.JsonMapper

class ResendEmailSenderTest {
    private val builder =
        RestClient.builder()
            .defaultHeaders { it.setBearerAuth("synthetic-resend-key") }
            .defaultStatusHandler({ true }, { _, _ -> })
    private val server = MockRestServiceServer.bindTo(builder).build()
    private val sender =
        ResendEmailSender(
            HttpServiceProxyFactory.builderFor(RestClientAdapter.create(builder.build()))
                .build()
                .createClient(ResendHttpApi::class.java),
            JsonMapper.builder().build(),
            "Förena <auth@example.invalid>",
        )
    private val message =
        EmailMessage(
            "member@example.invalid",
            "Logga in i Förena",
            "Engångslänk: https://example.invalid/?code=synthetic",
            "native-auth/synthetic-event-id",
        )

    @Test
    fun `uses the Resend endpoint bearer auth and a stable idempotency key on retry`() {
        repeat(2) { attempt ->
            server
                .expect(requestTo("https://api.resend.com/emails"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("Authorization", "Bearer synthetic-resend-key"))
                .andExpect(header("Idempotency-Key", message.idempotencyKey))
                .andExpect(
                    content()
                        .json(
                            """{"from":"Förena <auth@example.invalid>","to":["member@example.invalid"],"subject":"Logga in i Förena","text":"Engångslänk: https://example.invalid/?code=synthetic"}"""
                        )
                )
                .andRespond(
                    if (attempt == 0) withStatus(HttpStatus.SERVICE_UNAVAILABLE)
                    else
                        withSuccess(
                            """{"id":"synthetic-provider-id"}""",
                            MediaType.APPLICATION_JSON,
                        )
                )
        }
        assertThat(sender.send(message)).isEqualTo(EmailDeliveryResult.Retry())
        assertThat(sender.send(message))
            .isEqualTo(EmailDeliveryResult.Accepted("synthetic-provider-id"))
        server.verify()
    }

    @Test
    fun `rate limits preserve Retry-After and timeout errors expose no sensitive details`() {
        server
            .expect(requestTo("https://api.resend.com/emails"))
            .andRespond(
                withStatus(HttpStatus.TOO_MANY_REQUESTS)
                    .header("Retry-After", "120")
                    .body("secret token and address")
            )
        server
            .expect(requestTo("https://api.resend.com/emails"))
            .andRespond(withException(SocketTimeoutException("secret token and address")))
        assertThat(sender.send(message)).isEqualTo(EmailDeliveryResult.Retry(120))
        assertThat(sender.send(message)).isEqualTo(EmailDeliveryResult.Retry())
        server.verify()
    }

    @Test
    fun `permanent errors and redirects are rejected without leaking provider bodies`() {
        for (status in
            listOf(
                HttpStatus.UNAUTHORIZED,
                HttpStatus.FORBIDDEN,
                HttpStatus.UNPROCESSABLE_ENTITY,
                HttpStatus.FOUND,
            )) {
            server
                .expect(requestTo("https://api.resend.com/emails"))
                .andRespond(
                    withStatus(status)
                        .header("Location", "https://example.invalid/steal")
                        .body("secret token and address")
                )
        }
        repeat(4) { assertThat(sender.send(message)).isEqualTo(EmailDeliveryResult.Rejected) }
        server.verify()
    }

    @Test
    fun `distinguishes a concurrent request from conflicting idempotency payloads`() {
        for (name in listOf("concurrent_idempotent_requests", "invalid_idempotent_request")) {
            server
                .expect(requestTo("https://api.resend.com/emails"))
                .andRespond(
                    withStatus(HttpStatus.CONFLICT)
                        .body("""{"name":"$name","message":"secret token and address"}""")
                )
        }
        assertThat(sender.send(message)).isEqualTo(EmailDeliveryResult.Retry())
        assertThat(sender.send(message)).isEqualTo(EmailDeliveryResult.Rejected)
        server.verify()
    }

    @Test
    fun `does not mark a malformed success as sent`() {
        for (body in listOf("not JSON", "{}")) {
            server
                .expect(requestTo("https://api.resend.com/emails"))
                .andRespond(withSuccess(body, MediaType.APPLICATION_JSON))
        }
        repeat(2) { assertThat(sender.send(message)).isEqualTo(EmailDeliveryResult.Retry()) }
        server.verify()
    }

    @Test
    fun `rejects a missing sender before contacting Resend`() {
        val api =
            HttpServiceProxyFactory.builderFor(RestClientAdapter.create(builder.build()))
                .build()
                .createClient(ResendHttpApi::class.java)
        assertThatThrownBy { ResendEmailSender(api, JsonMapper.builder().build(), "") }
            .isInstanceOf(IllegalArgumentException::class.java)
            .hasMessage("Configure RESEND_FROM_EMAIL")
        server.verify()
    }
}
