package se.forena.api.email.internal

import org.slf4j.LoggerFactory
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Profile
import se.forena.api.email.EmailDeliveryResult
import se.forena.api.email.EmailSender

/** Local development only: includes authentication links, so use fictitious accounts. */
@Configuration(proxyBeanMethods = false)
@Profile("local")
class LocalEmailConfiguration {
    private val logger = LoggerFactory.getLogger(LocalEmailConfiguration::class.java)

    @Bean fun localEmailSender(): EmailSender = EmailSender { message ->
        logger.info(
            "[LOCAL MAIL] To: {}\nSubject: {}\n{}", message.to, message.subject, message.text,
        )
        EmailDeliveryResult.Accepted("local/${message.idempotencyKey}")
    }
}
