package se.forena.api.identity.authentication

import jakarta.servlet.DispatcherType.ERROR
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import java.util.UUID
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.annotation.Order
import org.springframework.dao.DataAccessException
import org.springframework.scheduling.annotation.EnableScheduling
import org.springframework.security.authentication.BadCredentialsException
import org.springframework.security.authentication.ott.OneTimeTokenAuthenticationToken
import org.springframework.security.authentication.ott.OneTimeTokenService
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.access.intercept.AuthorizationFilter
import org.springframework.security.web.authentication.AuthenticationFailureHandler
import org.springframework.security.web.authentication.AuthenticationSuccessHandler
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter
import org.springframework.security.web.authentication.ott.OneTimeTokenAuthenticationConverter
import org.springframework.security.web.csrf.CsrfToken
import org.springframework.security.web.csrf.CsrfTokenRepository
import org.springframework.security.web.csrf.DefaultCsrfToken
import org.springframework.security.web.header.HeaderWriterFilter
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy.NO_REFERRER
import org.springframework.security.web.webauthn.authentication.PublicKeyCredentialRequestOptionsFilter
import org.springframework.security.web.webauthn.authentication.WebAuthnAuthenticationFilter
import org.springframework.security.web.webauthn.registration.PublicKeyCredentialCreationOptionsFilter
import org.springframework.security.web.webauthn.registration.WebAuthnRegistrationFilter
import org.springframework.session.web.http.HttpSessionIdResolver
import org.springframework.web.ErrorResponseException
import org.springframework.web.filter.OncePerRequestFilter
import se.forena.api.identity.BrowserLoginLimiter
import se.forena.api.identity.BrowserSessionSettings
import se.forena.api.identity.sessionCookie
import tools.jackson.core.JacksonException

/** OAuth forms use Spring CSRF; same-origin JSON APIs use the existing strict Origin/header contract. */
class StringCsrfTokenRepository : CsrfTokenRepository {
    override fun generateToken(request: HttpServletRequest): CsrfToken = DefaultCsrfToken("X-CSRF-TOKEN", "_csrf", UUID.randomUUID().toString())
    override fun loadToken(request: HttpServletRequest): CsrfToken? = (request.getSession(false)?.getAttribute("forena.csrf") as? String)?.let { DefaultCsrfToken("X-CSRF-TOKEN", "_csrf", it) }
    override fun saveToken(token: CsrfToken?, request: HttpServletRequest, response: HttpServletResponse) {
        if (token == null) request.getSession(false)?.removeAttribute("forena.csrf")
        else request.getSession(true).setAttribute("forena.csrf", token.token)
    }
}

class TransportFilter(private val settings: BrowserSessionSettings,
    private val limiter: BrowserLoginLimiter) : OncePerRequestFilter() {
    private val logger = LoggerFactory.getLogger(TransportFilter::class.java)

    override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain) {
        if (request.requestURI.startsWith("/api/")) {
            if (request.method !in listOf("GET", "HEAD", "OPTIONS") &&
                (request.getHeader("Origin") != settings.origin || request.getHeader("X-Forena-Request") != "1")) {
                fail(response, 403, "Begäran är inte tillåten."); return
            }
            if (!request.getHeader("Authorization").isNullOrBlank() || sessionCookie(request, settings.cookieName) == "invalid") {
                fail(response, 400, "Tvetydig autentisering."); return
            }
        }
        try {
            if (request.method == "POST" && request.requestURI in setOf(AuthenticationEndpoints.login.path, AuthenticationEndpoints.magic.path)) {
                val email = request.getParameter(if (request.requestURI == AuthenticationEndpoints.login.path) "email" else "username") ?: ""
                if (request.requestURI == AuthenticationEndpoints.login.path &&
                    (request.getParameter("password") ?: "").toByteArray(Charsets.UTF_8).size > 72) throw BadCredentialsException("Invalid password")
                limiter.admit(limiter.client(request), email)
            }
            if ((request.method == "POST" && request.requestURI.startsWith("/api/auth/passkey")) ||
                (request.method == "DELETE" && request.requestURI.startsWith("/api/auth/passkeys/")) ||
                (request.method == "POST" && request.requestURI == AuthenticationEndpoints.magicVerify.path)) limiter.admit(limiter.client(request))
            val auth = SecurityContextHolder.getContext().authentication
            val expected = request.getHeader("X-Forena-Account")
            if (auth != null && request.requestURI.startsWith("/api/") &&
                ((expected != null && expected != auth.name) || (!request.requestURI.startsWith("/api/auth/") && request.method !in listOf("GET", "HEAD", "OPTIONS") && expected == null))) {
                fail(response, 401, "Sessionen är inte aktiv."); return
            }
            chain.doFilter(request, response)
        } catch (_: DataAccessException) { if (!response.isCommitted) fail(response, 503, "Sessionen kan inte verifieras just nu.") }
        catch (error: ErrorResponseException) {
            error.headers.forEach { name, values -> values.forEach { response.addHeader(name, it) } }
            if (!response.isCommitted) fail(response, error.statusCode.value(), "Begäran kunde inte genomföras.")
        }
        catch (_: JacksonException) { if (!response.isCommitted) fail(response, 400, "Ogiltig begäran.") }
        catch (_: IllegalArgumentException) { if (!response.isCommitted) fail(response, 400, "Ogiltig begäran.") }
        catch (_: BadCredentialsException) { if (!response.isCommitted) fail(response, 401, "Sessionen är inte aktiv.") }
    }
    private fun fail(response: HttpServletResponse, status: Int, message: String) {
        logger.warn("request_denied status={}", status)
        response.status = status; response.contentType = "application/json;charset=UTF-8"; response.writer.write("{\"error\":\"$message\"}")
    }
}

@Configuration(proxyBeanMethods = false)
@EnableScheduling
class SecurityConfiguration {
    private val logger = LoggerFactory.getLogger(SecurityConfiguration::class.java)

    @Bean fun csrfRepository() = StringCsrfTokenRepository()
    @Bean @Order(3)
    fun webSecurity(http: HttpSecurity, contexts: AccountSecurityContextRepository, csrf: StringCsrfTokenRepository, settings: BrowserSessionSettings,
        passkey: WebAuthnAuthenticationFilter,
        requestOptions: PublicKeyCredentialRequestOptionsFilter,
        creationOptions: PublicKeyCredentialCreationOptionsFilter,
        registration: WebAuthnRegistrationFilter,
        @Qualifier("magicTokens") magic: OneTimeTokenService,
        success: AuthenticationSuccessHandler,
        failure: AuthenticationFailureHandler,
        limiter: BrowserLoginLimiter, accounts: AccountService,
        sessionIds: HttpSessionIdResolver): SecurityFilterChain {
        http.securityContext { it.securityContextRepository(contexts) }
            .sessionManagement { it.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED) }
            .requestCache { it.disable() }
            .csrf { it.csrfTokenRepository(csrf).ignoringRequestMatchers("/api/**") }
            .headers { it.referrerPolicy { policy -> policy.policy(NO_REFERRER) } }
            .addFilterAfter(TransportFilter(settings, limiter), HeaderWriterFilter::class.java)
            .addFilterBefore(passkey, UsernamePasswordAuthenticationFilter::class.java)
            .addFilterAfter(requestOptions, AuthorizationFilter::class.java)
            .addFilterAfter(creationOptions, AuthorizationFilter::class.java)
            .addFilterAfter(registration, AuthorizationFilter::class.java)
            .formLogin {
                it.loginPage("/login").loginProcessingUrl(AuthenticationEndpoints.login.path).usernameParameter("email")
                    .successHandler(success).failureHandler(failure)
            }
            .oneTimeTokenLogin {
                it.tokenService(magic).tokenGeneratingUrl(AuthenticationEndpoints.magic.path).loginProcessingUrl(AuthenticationEndpoints.magicVerify.path)
                    .showDefaultSubmitPage(false)
                    .tokenGenerationSuccessHandler { request, response, token ->
                        request.getSession(true).setAttribute(AccountService.MAGIC, settings.fingerprint(token.tokenValue))
                        response.contentType = "application/json;charset=UTF-8"; response.writer.write("{\"ok\":true}")
                    }
                    .authenticationConverter { request ->
                        val authentication = OneTimeTokenAuthenticationConverter().convert(request)
                        val token = authentication as OneTimeTokenAuthenticationToken
                        accounts.requireBrowserLink(token.tokenValue ?: "", request)
                        token
                    }
                    .authenticationSuccessHandler(success).authenticationFailureHandler(failure)
            }
            .logout {
                it.logoutUrl(AuthenticationEndpoints.logout.path).addLogoutHandler { request, response, _ -> sessionIds.expireSession(request, response) }
                    .logoutSuccessHandler { _, response, _ -> response.contentType = "application/json;charset=UTF-8"; response.writer.write("{\"ok\":true}") }
            }
            .authorizeHttpRequests {
                it.dispatcherTypeMatchers(ERROR).permitAll()
                it.requestMatchers("/actuator/health", AuthenticationEndpoints.login.path, AuthenticationEndpoints.logout.path, "/api/auth/register", "/api/auth/email/verify",
                    "/api/auth/password/reset-request", "/api/auth/password/reset", AuthenticationEndpoints.magic.path, AuthenticationEndpoints.magicVerify.path,
                    AuthenticationEndpoints.passkeyOptions.path, AuthenticationEndpoints.passkeyVerify.path, "/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/api/mcp").permitAll()
                    .anyRequest().authenticated()
            }.exceptionHandling { it.authenticationEntryPoint { _, response, _ ->
                logger.warn("auth_failed reason=missing_session")
                response.status = 401; response.contentType = "application/json;charset=UTF-8"; response.setHeader("Cache-Control", "no-store")
                response.writer.write("{\"error\":\"Inloggning krävs.\"}")
            } }
        return http.build()
    }
}
