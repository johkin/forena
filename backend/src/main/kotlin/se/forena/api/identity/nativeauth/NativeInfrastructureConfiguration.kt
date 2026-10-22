package se.forena.api.identity.nativeauth

import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.authentication.ott.JdbcOneTimeTokenService
import org.springframework.security.crypto.factory.PasswordEncoderFactories
import org.springframework.security.web.webauthn.api.*
import org.springframework.security.web.webauthn.management.*
import se.forena.api.identity.BrowserSessionSettings
import java.net.URI

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = ["forena.auth.mode"], havingValue = "native")
class NativeInfrastructureConfiguration(private val settings: BrowserSessionSettings,
    @Value("\${forena.native-auth.rp-id:}") private val configuredRp: String,
    @Value("\${forena.native-auth.smtp-host:}") private val smtp: String) {
    init { settings.requireEnabled(); require(smtp.isNotBlank()) { "Configure FORENA_SMTP_HOST" } }
    @Bean
    @org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean(org.springframework.mail.javamail.JavaMailSender::class)
    fun nativeMailSender(@Value("\${forena.native-auth.smtp-port:587}") port: Int,
        @Value("\${forena.native-auth.smtp-username:}") username: String, @Value("\${forena.native-auth.smtp-password:}") password: String,
        @Value("\${forena.native-auth.smtp-auth:true}") auth: Boolean, @Value("\${forena.native-auth.smtp-require-tls:true}") tls: Boolean): org.springframework.mail.javamail.JavaMailSenderImpl {
        require(tls || smtp in listOf("localhost", "127.0.0.1")) { "SMTP requires TLS outside loopback" }
        return org.springframework.mail.javamail.JavaMailSenderImpl().apply {
            host = smtp; this.port = port; this.username = username; this.password = password
            defaultEncoding = "UTF-8"
            javaMailProperties.setProperty("mail.smtp.auth", auth.toString())
            javaMailProperties.setProperty("mail.smtp.starttls.enable", "true")
            javaMailProperties.setProperty("mail.smtp.ssl.checkserveridentity", "true")
            javaMailProperties.setProperty("mail.smtp.starttls.required", tls.toString())
            for (name in listOf("connectiontimeout", "timeout", "writetimeout")) javaMailProperties.setProperty("mail.smtp.$name", "5000")
        }
    }
    @Bean fun nativePasswords() = PasswordEncoderFactories.createDelegatingPasswordEncoder()
    @Bean fun nativeOneTimeTokens(jdbc: JdbcTemplate) = JdbcOneTimeTokenService(jdbc)
    @Bean fun nativeCredentialUsers(jdbc: JdbcTemplate) = JdbcPublicKeyCredentialUserEntityRepository(jdbc)
    @Bean fun nativeCredentials(jdbc: JdbcTemplate) = JdbcUserCredentialRepository(jdbc)
    @Bean fun nativeRelyingParty(users: JdbcPublicKeyCredentialUserEntityRepository, credentials: JdbcUserCredentialRepository): WebAuthnRelyingPartyOperations {
        val host = URI(settings.origin).host
        val rp = configuredRp.ifBlank { host }
        require(host == rp || host.endsWith(".$rp")) { "RP ID must match the canonical origin" }
        return Webauthn4JRelyingPartyOperations(users, credentials,
            PublicKeyCredentialRpEntity.builder().id(rp).name("Förena").build(), setOf(settings.origin)).apply {
            setCustomizeCreationOptions { it.authenticatorSelection(AuthenticatorSelectionCriteria.builder()
                .residentKey(ResidentKeyRequirement.REQUIRED).userVerification(UserVerificationRequirement.REQUIRED).build()) }
            setCustomizeRequestOptions { it.userVerification(UserVerificationRequirement.REQUIRED) }
        }
    }
}
