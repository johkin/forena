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
    @Value("\${forena.native-auth.rp-id:}") private val configuredRp: String) {
    init { settings.requireEnabled() }
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
