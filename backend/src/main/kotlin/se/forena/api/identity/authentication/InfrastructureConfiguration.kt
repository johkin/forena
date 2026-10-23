package se.forena.api.identity.authentication

import java.net.URI
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.authentication.ott.JdbcOneTimeTokenService
import org.springframework.security.crypto.factory.PasswordEncoderFactories
import org.springframework.security.web.webauthn.api.AuthenticatorSelectionCriteria
import org.springframework.security.web.webauthn.api.PublicKeyCredentialRpEntity
import org.springframework.security.web.webauthn.api.ResidentKeyRequirement
import org.springframework.security.web.webauthn.api.UserVerificationRequirement
import org.springframework.security.web.webauthn.management.JdbcPublicKeyCredentialUserEntityRepository
import org.springframework.security.web.webauthn.management.JdbcUserCredentialRepository
import org.springframework.security.web.webauthn.management.WebAuthnRelyingPartyOperations
import org.springframework.security.web.webauthn.management.Webauthn4JRelyingPartyOperations
import se.forena.api.identity.BrowserSessionSettings

@Configuration(proxyBeanMethods = false)
class InfrastructureConfiguration(private val settings: BrowserSessionSettings,
    @Value("\${forena.authentication.rp-id:}") private val configuredRp: String) {
    init { settings.requireEnabled() }
    @Bean fun passwords() = PasswordEncoderFactories.createDelegatingPasswordEncoder()
    @Bean fun oneTimeTokens(jdbc: JdbcTemplate) = JdbcOneTimeTokenService(jdbc)
    @Bean fun credentialUsers(jdbc: JdbcTemplate) = JdbcPublicKeyCredentialUserEntityRepository(jdbc)
    @Bean fun credentials(jdbc: JdbcTemplate) = JdbcUserCredentialRepository(jdbc)
    @Bean fun relyingParty(users: JdbcPublicKeyCredentialUserEntityRepository, credentials: JdbcUserCredentialRepository): WebAuthnRelyingPartyOperations {
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
