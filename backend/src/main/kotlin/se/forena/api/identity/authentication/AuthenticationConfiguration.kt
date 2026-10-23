package se.forena.api.identity.authentication

import jakarta.servlet.Filter
import java.time.Instant
import java.util.Locale.ROOT
import java.util.UUID
import org.springframework.boot.web.servlet.FilterRegistrationBean
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpMethod.DELETE
import org.springframework.http.HttpMethod.POST
import org.springframework.security.authentication.AuthenticationManager
import org.springframework.security.authentication.AuthenticationServiceException
import org.springframework.security.authentication.BadCredentialsException
import org.springframework.security.authentication.InternalAuthenticationServiceException
import org.springframework.security.authentication.ProviderManager
import org.springframework.security.authentication.dao.DaoAuthenticationProvider
import org.springframework.security.authentication.ott.DefaultOneTimeToken
import org.springframework.security.authentication.ott.GenerateOneTimeTokenRequest
import org.springframework.security.authentication.ott.OneTimeToken
import org.springframework.security.authentication.ott.OneTimeTokenAuthenticationToken
import org.springframework.security.authentication.ott.OneTimeTokenService
import org.springframework.security.core.userdetails.User
import org.springframework.security.core.userdetails.UserDetailsService
import org.springframework.security.core.userdetails.UsernameNotFoundException
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.security.web.authentication.AuthenticationFailureHandler
import org.springframework.security.web.authentication.AuthenticationSuccessHandler
import org.springframework.security.web.authentication.session.ChangeSessionIdAuthenticationStrategy
import org.springframework.security.web.csrf.CsrfAuthenticationStrategy
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher
import org.springframework.security.web.webauthn.authentication.PublicKeyCredentialRequestOptionsFilter
import org.springframework.security.web.webauthn.authentication.WebAuthnAuthenticationFilter
import org.springframework.security.web.webauthn.authentication.WebAuthnAuthenticationProvider
import org.springframework.security.web.webauthn.management.CredentialRecordOwnerAuthorizationManager
import org.springframework.security.web.webauthn.management.JdbcPublicKeyCredentialUserEntityRepository
import org.springframework.security.web.webauthn.management.JdbcUserCredentialRepository
import org.springframework.security.web.webauthn.management.WebAuthnRelyingPartyOperations
import org.springframework.security.web.webauthn.registration.PublicKeyCredentialCreationOptionsFilter
import org.springframework.security.web.webauthn.registration.WebAuthnRegistrationFilter
import se.forena.api.identity.BrowserSessionView
import se.forena.api.identity.BrowserUser
import se.forena.api.identity.internal.UserRepository
import tools.jackson.databind.json.JsonMapper

/** Adapters for our account model and JSON transport; authentication is performed by Spring. */
@Configuration(proxyBeanMethods = false)
class AuthenticationConfiguration {
    @Bean fun userDetails(users: UserRepository, accounts: AccountService) = UserDetailsService { name ->
        val id = runCatching { UUID.fromString(name) }.getOrNull()
        val candidate = if (id != null) users.findById(id) else users.findByEmail(name.trim().lowercase(ROOT))
        val user = candidate ?: throw UsernameNotFoundException("Unknown account")
        try { accounts.requireUser(user.subject) } catch (_: BadCredentialsException) { throw UsernameNotFoundException("Inactive account") }
        User.withUsername(user.subject.toString()).password(user.passwordHash)
            .authorities("USER", "AUTH_VERSION_${user.authVersion}").build()
    }
    @Bean fun passwordManager(details: UserDetailsService, passwords: PasswordEncoder): AuthenticationManager =
        ProviderManager(DaoAuthenticationProvider(details).apply { setPasswordEncoder(passwords) })

    @Bean fun authenticationSuccess(accounts: AccountService, json: JsonMapper, csrf: StringCsrfTokenRepository) =
        AuthenticationSuccessHandler { request, response, authentication ->
            CsrfAuthenticationStrategy(csrf).onAuthentication(authentication, request, response)
            val user = accounts.requireUser(UUID.fromString(authentication.name))
            response.contentType = "application/json;charset=UTF-8"
            json.writeValue(response.outputStream, BrowserSessionView(BrowserUser(user.subject.toString(), user.email)))
        }
    @Bean fun authenticationFailure() = AuthenticationFailureHandler { _, response, failure ->
        response.status = if (failure is InternalAuthenticationServiceException || failure is AuthenticationServiceException) 503 else 401
        response.contentType = "application/json;charset=UTF-8"
        response.writer.write("{\"error\":\"Inloggningen kunde inte genomföras.\"}")
    }
    @Bean fun options() = StringWebAuthnOptions()
    @Bean fun webAuthnLogin(relyingParty: WebAuthnRelyingPartyOperations, details: UserDetailsService,
        contexts: AccountSecurityContextRepository, options: StringWebAuthnOptions,
        success: AuthenticationSuccessHandler, failure: AuthenticationFailureHandler) = WebAuthnAuthenticationFilter().apply {
            setRequiresAuthenticationRequestMatcher(post(AuthenticationEndpoints.passkeyVerify.path))
            setAuthenticationManager(ProviderManager(WebAuthnAuthenticationProvider(relyingParty, details)))
            setSecurityContextRepository(contexts); setRequestOptionsRepository(options.requests)
            setSessionAuthenticationStrategy(ChangeSessionIdAuthenticationStrategy())
            setAuthenticationSuccessHandler(success); setAuthenticationFailureHandler(failure)
        }
    @Bean fun webAuthnRequestOptions(relyingParty: WebAuthnRelyingPartyOperations, options: StringWebAuthnOptions) = PublicKeyCredentialRequestOptionsFilter(relyingParty).apply {
            setRequestMatcher(post(AuthenticationEndpoints.passkeyOptions.path)); setRequestOptionsRepository(options.requests)
        }
    @Bean fun webAuthnCreationOptions(relyingParty: WebAuthnRelyingPartyOperations, options: StringWebAuthnOptions) = PublicKeyCredentialCreationOptionsFilter(relyingParty).apply {
            setRequestMatcher(post(AuthenticationEndpoints.registrationOptions.path)); setCreationOptionsRepository(options.creations)
        }
    @Bean fun webAuthnRegistration(credentials: JdbcUserCredentialRepository, users: JdbcPublicKeyCredentialUserEntityRepository,
        relyingParty: WebAuthnRelyingPartyOperations, options: StringWebAuthnOptions) =
        WebAuthnRegistrationFilter(credentials, relyingParty).apply {
            setRegisterCredentialMatcher(post(AuthenticationEndpoints.registrationVerify.path))
            setRemoveCredentialMatcher(PathPatternRequestMatcher.withDefaults().matcher(DELETE, "/api/auth/passkeys/{id}"))
            setCreationOptionsRepository(options.creations)
            setDeleteCredentialAuthorizationManager(CredentialRecordOwnerAuthorizationManager(credentials, users))
        }
    @Bean fun magicTokens(accounts: AccountService): OneTimeTokenService = object : OneTimeTokenService {
        override fun generate(request: GenerateOneTimeTokenRequest): OneTimeToken =
            accounts.requestLink(request.username, "login")
                ?: DefaultOneTimeToken(UUID.randomUUID().toString(), "unknown", Instant.now().plusSeconds(600))
        override fun consume(authentication: OneTimeTokenAuthenticationToken): OneTimeToken {
            val value = authentication.tokenValue ?: throw BadCredentialsException("Invalid link")
            val user = accounts.magicLogin(value)
            return DefaultOneTimeToken(value, user.subject.toString(), Instant.now().plusSeconds(600))
        }
    }
    // Filter beans belong only to the Spring Security chain, never the servlet container chain.
    @Bean fun disablePasskeyRegistration(filter: WebAuthnAuthenticationFilter) = disabled(filter)
    @Bean fun disableRequestOptionsRegistration(filter: PublicKeyCredentialRequestOptionsFilter) = disabled(filter)
    @Bean fun disableCreationOptionsRegistration(filter: PublicKeyCredentialCreationOptionsFilter) = disabled(filter)
    @Bean fun disableCredentialRegistration(filter: WebAuthnRegistrationFilter) = disabled(filter)
    private fun <T : Filter> disabled(filter: T) = FilterRegistrationBean(filter).apply { isEnabled = false }
    companion object {
        fun post(path: String) = PathPatternRequestMatcher.withDefaults().matcher(POST, path)
    }
}
