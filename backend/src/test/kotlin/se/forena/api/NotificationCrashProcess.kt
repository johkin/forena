package se.forena.api

import java.util.UUID
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.builder.SpringApplicationBuilder
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Primary
import org.springframework.jdbc.core.JdbcTemplate
import se.forena.api.email.EmailDeliveryResult
import se.forena.api.email.EmailSender
import se.forena.api.notifications.NotificationWorker

/**
 * Separate, disposable JVM. Fault modes are test-only and never included in the application JAR.
 */
object NotificationCrashProcess {
    @JvmStatic
    fun main(args: Array<String>) {
        SpringApplicationBuilder(ForenaApplication::class.java, CrashEmailConfiguration::class.java)
            .run(*args)
            .use { context ->
                context.getBean(NotificationWorker::class.java).run()
            }
        kotlin.system.exitProcess(0)
    }
}

@TestConfiguration(proxyBeanMethods = false)
class CrashEmailConfiguration {
    @Bean
    @Primary
    fun crashEmailSender(
        jdbc: JdbcTemplate,
        @Value("\${test.crash-mode}") mode: String,
    ): EmailSender = EmailSender { message ->
        if (mode == "before-effect") Runtime.getRuntime().halt(137)
        jdbc.update(
            "insert into forena.notification_test_provider(id, jvm_id) values(?, ?) on conflict (id) do update set requests=notification_test_provider.requests+1",
            message.idempotencyKey,
            UUID.randomUUID().toString(),
        )
        if (mode == "after-effect") Runtime.getRuntime().halt(137)
        if (mode == "sigterm") Thread.sleep(120_000)
        EmailDeliveryResult.Accepted("test-provider/${message.idempotencyKey}")
    }
}
