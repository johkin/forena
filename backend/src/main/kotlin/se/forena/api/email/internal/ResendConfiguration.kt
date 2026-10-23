package se.forena.api.email.internal

import java.net.HttpURLConnection
import java.time.Duration
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Profile
import org.springframework.http.client.SimpleClientHttpRequestFactory
import org.springframework.web.client.RestClient
import se.forena.api.email.EmailSender
import tools.jackson.databind.json.JsonMapper

@Configuration(proxyBeanMethods = false)
@Profile("!local")
class ResendConfiguration {
    @Bean fun resendEmailSender(@Value("\${forena.email.resend-api-key:}") apiKey: String,
                               @Value("\${forena.email.from:}") from: String, json: JsonMapper): EmailSender {
        val factory = object : SimpleClientHttpRequestFactory() {
            override fun prepareConnection(connection: HttpURLConnection, httpMethod: String) {
                super.prepareConnection(connection, httpMethod)
                connection.instanceFollowRedirects = false
            }
        }.apply { setConnectTimeout(Duration.ofSeconds(5)); setReadTimeout(Duration.ofSeconds(10)) }
        return ResendEmailSender(RestClient.builder().requestFactory(factory).build(), json, apiKey, from)
    }
}
