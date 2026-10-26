package se.forena.api.email.internal

import java.net.HttpURLConnection
import java.time.Duration
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Profile
import org.springframework.http.client.SimpleClientHttpRequestFactory
import org.springframework.web.client.support.RestClientHttpServiceGroupConfigurer
import org.springframework.web.service.registry.ImportHttpServices
import se.forena.api.email.EmailSender
import tools.jackson.databind.json.JsonMapper

@Configuration(proxyBeanMethods = false)
@Profile("!local")
@ImportHttpServices(group = "resend", types = [ResendHttpApi::class])
class ResendConfiguration {
    @Bean
    fun resendClientConfigurer(
        @Value("\${forena.email.resend-api-key:}") apiKey: String
    ): RestClientHttpServiceGroupConfigurer {
        require(apiKey.isNotBlank() && apiKey.none { it.isWhitespace() }) {
            "Configure RESEND_API_KEY"
        }
        val factory =
            object : SimpleClientHttpRequestFactory() {
                    override fun prepareConnection(
                        connection: HttpURLConnection,
                        httpMethod: String,
                    ) {
                        super.prepareConnection(connection, httpMethod)
                        connection.instanceFollowRedirects = false
                    }
                }
                .apply {
                    setConnectTimeout(Duration.ofSeconds(5))
                    setReadTimeout(Duration.ofSeconds(10))
                }
        return RestClientHttpServiceGroupConfigurer { groups ->
            groups.filterByName("resend").forEachClient { _, builder ->
                builder
                    .requestFactory(factory)
                    .defaultHeaders { it.setBearerAuth(apiKey) }
                    .defaultStatusHandler({ true }, { _, _ -> })
            }
        }
    }

    @Bean
    fun resendEmailSender(
        api: ResendHttpApi,
        json: JsonMapper,
        @Value("\${forena.email.from:}") from: String,
    ): EmailSender = ResendEmailSender(api, json, from)
}
