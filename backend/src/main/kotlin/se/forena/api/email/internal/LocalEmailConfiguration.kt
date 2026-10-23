package se.forena.api.email.internal

import org.slf4j.LoggerFactory
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Profile
import se.forena.api.email.EmailDeliveryResult
import se.forena.api.email.EmailSender

/** Local development only: includes authentication links, so use fictitious accounts. */
@Configuration(proxyBeanMethods = false)
@Profile("local")
@ConditionalOnProperty(name = ["forena.auth.mode"], havingValue = "native")
class LocalEmailConfiguration {
    @Bean fun localEmailSender(): EmailSender = EmailSender { message ->
        LoggerFactory.getLogger(LocalEmailConfiguration::class.java).info(
            "[LOCAL MAIL] To: {}\nSubject: {}\n{}", message.to, message.subject, message.text,
        )
        EmailDeliveryResult.Accepted("local/${message.idempotencyKey}")
    }
}
