package se.forena.api.identity.nativeauth

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import java.time.Instant
import java.util.UUID
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.security.authentication.*
import org.springframework.security.authentication.dao.DaoAuthenticationProvider
import org.springframework.security.authentication.ott.*
import org.springframework.security.core.Authentication
import org.springframework.security.core.userdetails.User
import org.springframework.security.core.userdetails.UserDetailsService
import org.springframework.security.core.userdetails.UsernameNotFoundException
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.security.web.authentication.*
import org.springframework.security.web.authentication.session.ChangeSessionIdAuthenticationStrategy
import org.springframework.security.web.context.SecurityContextRepository
import org.springframework.security.web.csrf.CsrfAuthenticationStrategy
import org.springframework.security.web.webauthn.authentication.*
import org.springframework.security.web.webauthn.registration.*
import org.springframework.security.web.webauthn.management.*
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher
import se.forena.api.identity.*
import se.forena.api.identity.internal.NativeUserRepository
import tools.jackson.databind.json.JsonMapper

/** Adapters for our account model and JSON transport; authentication is performed by Spring. */
@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = ["forena.auth.mode"], havingValue = "native")
class NativeAuthenticationConfiguration {
    @Bean fun nativeUserDetails(users: NativeUserRepository, accounts: NativeAccountService) = UserDetailsService { name ->
        val id = runCatching { UUID.fromString(name) }.getOrNull()
        val candidate = if (id != null) users.findById(id) else users.findByEmail(name.trim().lowercase(java.util.Locale.ROOT))
        val user = candidate ?: throw UsernameNotFoundException("Unknown account")
        try { accounts.requireUser(user.subject) } catch (_: BadCredentialsException) { throw UsernameNotFoundException("Inactive account") }
        User.withUsername(user.subject.toString()).password(user.passwordHash)
            .authorities("USER", "AUTH_VERSION_${user.authVersion}").build()
    }
    @Bean fun nativePasswordManager(details: UserDetailsService, passwords: PasswordEncoder): AuthenticationManager =
        ProviderManager(DaoAuthenticationProvider(details).apply { setPasswordEncoder(passwords) })

    @Bean fun nativeAuthenticationSuccess(accounts: NativeAccountService, json: JsonMapper, csrf: StringCsrfTokenRepository) =
        AuthenticationSuccessHandler { request, response, authentication ->
            CsrfAuthenticationStrategy(csrf).onAuthentication(authentication, request, response)
            val user = accounts.requireUser(UUID.fromString(authentication.name))
            response.contentType = "application/json"
            json.writeValue(response.outputStream, BrowserSessionView(BrowserUser(user.subject.toString(), user.email)))
        }
    @Bean fun nativeAuthenticationFailure() = AuthenticationFailureHandler { _, response, failure ->
        response.status = if (failure is InternalAuthenticationServiceException || failure is AuthenticationServiceException) 503 else 401
        response.contentType = "application/json"
        response.writer.write("{\"error\":\"Inloggningen kunde inte genomföras.\"}")
    }
    @Bean fun nativeOptions() = StringWebAuthnOptions()
    @Bean fun nativeWebAuthnLogin(relyingParty: WebAuthnRelyingPartyOperations, details: UserDetailsService,
        contexts: NativeSessionRepository, options: StringWebAuthnOptions,
        success: AuthenticationSuccessHandler, failure: AuthenticationFailureHandler) = WebAuthnAuthenticationFilter().apply {
            setRequiresAuthenticationRequestMatcher(post(NativeAuthenticationEndpoints.passkeyVerify.path))
            setAuthenticationManager(ProviderManager(WebAuthnAuthenticationProvider(relyingParty, details)))
            setSecurityContextRepository(contexts); setRequestOptionsRepository(options.requests)
            setSessionAuthenticationStrategy(ChangeSessionIdAuthenticationStrategy())
            setAuthenticationSuccessHandler(success); setAuthenticationFailureHandler(failure)
        }
    @Bean fun nativeWebAuthnRequestOptions(relyingParty: WebAuthnRelyingPartyOperations, options: StringWebAuthnOptions) = PublicKeyCredentialRequestOptionsFilter(relyingParty).apply {
            setRequestMatcher(post(NativeAuthenticationEndpoints.passkeyOptions.path)); setRequestOptionsRepository(options.requests)
        }
    @Bean fun nativeWebAuthnCreationOptions(relyingParty: WebAuthnRelyingPartyOperations, options: StringWebAuthnOptions) = PublicKeyCredentialCreationOptionsFilter(relyingParty).apply {
            setRequestMatcher(post(NativeAuthenticationEndpoints.registrationOptions.path)); setCreationOptionsRepository(options.creations)
        }
    @Bean fun nativeWebAuthnRegistration(credentials: JdbcUserCredentialRepository, users: JdbcPublicKeyCredentialUserEntityRepository,
        relyingParty: WebAuthnRelyingPartyOperations, options: StringWebAuthnOptions) =
        WebAuthnRegistrationFilter(credentials, relyingParty).apply {
            setRegisterCredentialMatcher(post(NativeAuthenticationEndpoints.registrationVerify.path))
            setRemoveCredentialMatcher(PathPatternRequestMatcher.withDefaults().matcher(org.springframework.http.HttpMethod.DELETE, "/api/auth/passkeys/{id}"))
            setCreationOptionsRepository(options.creations)
            setDeleteCredentialAuthorizationManager(CredentialRecordOwnerAuthorizationManager(credentials, users))
        }
    @Bean fun nativeMagicTokens(accounts: NativeAccountService): OneTimeTokenService = object : OneTimeTokenService {
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
    private fun <T : jakarta.servlet.Filter> disabled(filter: T) = org.springframework.boot.web.servlet.FilterRegistrationBean(filter).apply { isEnabled = false }
    companion object {
        fun post(path: String) = PathPatternRequestMatcher.withDefaults().matcher(org.springframework.http.HttpMethod.POST, path)
    }
}
