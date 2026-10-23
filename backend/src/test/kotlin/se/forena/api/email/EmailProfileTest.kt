package se.forena.api.email

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith
import org.springframework.boot.test.context.runner.ApplicationContextRunner
import org.springframework.boot.test.system.CapturedOutput
import org.springframework.boot.test.system.OutputCaptureExtension
import se.forena.api.email.internal.LocalEmailConfiguration
import se.forena.api.email.internal.ResendConfiguration
import tools.jackson.databind.json.JsonMapper

@ExtendWith(OutputCaptureExtension::class)
class EmailProfileTest {
    private val context = ApplicationContextRunner()
        .withUserConfiguration(LocalEmailConfiguration::class.java, ResendConfiguration::class.java)
        .withBean(JsonMapper::class.java, { JsonMapper.builder().build() })

    @Test fun `local logs mail even when Resend credentials are configured`(output: CapturedOutput) {
        context.withPropertyValues("spring.profiles.active=local", "forena.email.resend-api-key=unused",
            "forena.email.from=unused@example.test").run { application ->
            assertThat(application).hasSingleBean(EmailSender::class.java).hasBean("localEmailSender")
                .doesNotHaveBean("resendEmailSender")
            val result = application.getBean(EmailSender::class.java).send(
                EmailMessage("local@example.test", "Test", "http://localhost:3000/auth/callback?token=local-test", "test/1"))
            assertThat(result).isEqualTo(EmailDeliveryResult.Accepted("local/test/1"))
            assertThat(output.out).contains("[LOCAL MAIL]", "local@example.test", "token=local-test")
        }
    }

    @Test fun `outside local only the Resend sender is registered`() {
        context.withPropertyValues("forena.email.resend-api-key=test-key", "forena.email.from=test@example.test")
            .run { application ->
                assertThat(application).hasSingleBean(EmailSender::class.java).hasBean("resendEmailSender")
                    .doesNotHaveBean("localEmailSender")
            }
    }

    @Test fun `local sender needs no Resend configuration`() {
        context.withPropertyValues("spring.profiles.active=local").run { application ->
            assertThat(application).hasSingleBean(EmailSender::class.java).hasBean("localEmailSender")
        }
    }
}
