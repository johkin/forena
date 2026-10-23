package se.forena.api.identity.nativeauth

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.slf4j.LoggerFactory
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.annotation.Order
import org.springframework.dao.DataAccessException
import org.springframework.scheduling.annotation.EnableScheduling
import org.springframework.security.authentication.BadCredentialsException
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.context.SecurityContextHolderFilter
import org.springframework.security.web.csrf.CsrfToken
import org.springframework.security.web.csrf.CsrfTokenRepository
import org.springframework.security.web.csrf.DefaultCsrfToken
import org.springframework.web.filter.OncePerRequestFilter
import se.forena.api.identity.BrowserSessionSettings
import se.forena.api.identity.sessionCookie
import java.util.UUID

/** OAuth forms use Spring CSRF; same-origin JSON APIs use the existing strict Origin/header contract. */
class StringCsrfTokenRepository : CsrfTokenRepository {
    override fun generateToken(request: HttpServletRequest): CsrfToken = DefaultCsrfToken("X-CSRF-TOKEN", "_csrf", UUID.randomUUID().toString())
    override fun loadToken(request: HttpServletRequest): CsrfToken? = (request.getSession(false)?.getAttribute("forena.csrf") as? String)?.let { DefaultCsrfToken("X-CSRF-TOKEN", "_csrf", it) }
    override fun saveToken(token: CsrfToken?, request: HttpServletRequest, response: HttpServletResponse) {
        if (token == null) request.getSession(false)?.removeAttribute("forena.csrf")
        else request.getSession(true).setAttribute("forena.csrf", token.token)
    }
}

class NativeTransportFilter(private val settings: BrowserSessionSettings,
    private val limiter: se.forena.api.identity.BrowserLoginLimiter) : OncePerRequestFilter() {
    private val logger = LoggerFactory.getLogger(NativeTransportFilter::class.java)

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
            if (request.method == "POST" && request.requestURI in setOf(NativeAuthenticationEndpoints.login.path, NativeAuthenticationEndpoints.magic.path)) {
                val email = request.getParameter(if (request.requestURI == NativeAuthenticationEndpoints.login.path) "email" else "username") ?: ""
                if (request.requestURI == NativeAuthenticationEndpoints.login.path &&
                    (request.getParameter("password") ?: "").toByteArray(Charsets.UTF_8).size > 72) throw BadCredentialsException("Invalid password")
                limiter.admit(limiter.client(request), email)
            }
            if ((request.method == "POST" && request.requestURI.startsWith("/api/auth/passkey")) ||
                (request.method == "DELETE" && request.requestURI.startsWith("/api/auth/passkeys/")) ||
                (request.method == "POST" && request.requestURI == NativeAuthenticationEndpoints.magicVerify.path)) limiter.admit(limiter.client(request))
            val auth = SecurityContextHolder.getContext().authentication
            val expected = request.getHeader("X-Forena-Account")
            if (auth != null && request.requestURI.startsWith("/api/") &&
                ((expected != null && expected != auth.name) || (!request.requestURI.startsWith("/api/auth/") && request.method !in listOf("GET", "HEAD", "OPTIONS") && expected == null))) {
                fail(response, 401, "Sessionen är inte aktiv."); return
            }
            chain.doFilter(request, response)
        } catch (_: DataAccessException) { if (!response.isCommitted) fail(response, 503, "Sessionen kan inte verifieras just nu.") }
        catch (error: org.springframework.web.ErrorResponseException) {
            error.headers.forEach { name, values -> values.forEach { response.addHeader(name, it) } }
            if (!response.isCommitted) fail(response, error.statusCode.value(), "Begäran kunde inte genomföras.")
        }
        catch (_: tools.jackson.core.JacksonException) { if (!response.isCommitted) fail(response, 400, "Ogiltig begäran.") }
        catch (_: IllegalArgumentException) { if (!response.isCommitted) fail(response, 400, "Ogiltig begäran.") }
        catch (_: BadCredentialsException) { if (!response.isCommitted) fail(response, 401, "Sessionen är inte aktiv.") }
    }
    private fun fail(response: HttpServletResponse, status: Int, message: String) {
        logger.warn("native_request_denied status={}", status)
        response.status = status; response.contentType = "application/json"; response.writer.write("{\"error\":\"$message\"}")
    }
}

@Configuration(proxyBeanMethods = false)
@EnableScheduling
@ConditionalOnProperty(name = ["forena.auth.mode"], havingValue = "native")
class NativeSecurityConfiguration {
    private val logger = LoggerFactory.getLogger(NativeSecurityConfiguration::class.java)

    @Bean fun nativeCsrfRepository() = StringCsrfTokenRepository()
    @Bean @Order(3)
    fun nativeWebSecurity(http: HttpSecurity, contexts: NativeSessionRepository, csrf: StringCsrfTokenRepository, settings: BrowserSessionSettings,
        passkey: org.springframework.security.web.webauthn.authentication.WebAuthnAuthenticationFilter,
        requestOptions: org.springframework.security.web.webauthn.authentication.PublicKeyCredentialRequestOptionsFilter,
        creationOptions: org.springframework.security.web.webauthn.registration.PublicKeyCredentialCreationOptionsFilter,
        registration: org.springframework.security.web.webauthn.registration.WebAuthnRegistrationFilter,
        @org.springframework.beans.factory.annotation.Qualifier("nativeMagicTokens") magic: org.springframework.security.authentication.ott.OneTimeTokenService,
        success: org.springframework.security.web.authentication.AuthenticationSuccessHandler,
        failure: org.springframework.security.web.authentication.AuthenticationFailureHandler,
        limiter: se.forena.api.identity.BrowserLoginLimiter, accounts: NativeAccountService,
        sessionIds: org.springframework.session.web.http.HttpSessionIdResolver): SecurityFilterChain {
        http.securityContext { it.securityContextRepository(contexts) }
            .sessionManagement { it.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED) }
            .requestCache { it.disable() }
            .csrf { it.csrfTokenRepository(csrf).ignoringRequestMatchers("/api/**") }
            .headers { it.referrerPolicy { policy -> policy.policy(org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy.NO_REFERRER) } }
            .addFilterAfter(NativeTransportFilter(settings, limiter), org.springframework.security.web.header.HeaderWriterFilter::class.java)
            .addFilterBefore(passkey, org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter::class.java)
            .addFilterAfter(requestOptions, org.springframework.security.web.access.intercept.AuthorizationFilter::class.java)
            .addFilterAfter(creationOptions, org.springframework.security.web.access.intercept.AuthorizationFilter::class.java)
            .addFilterAfter(registration, org.springframework.security.web.access.intercept.AuthorizationFilter::class.java)
            .formLogin {
                it.loginPage("/login").loginProcessingUrl(NativeAuthenticationEndpoints.login.path).usernameParameter("email")
                    .successHandler(success).failureHandler(failure)
            }
            .oneTimeTokenLogin {
                it.tokenService(magic).tokenGeneratingUrl(NativeAuthenticationEndpoints.magic.path).loginProcessingUrl(NativeAuthenticationEndpoints.magicVerify.path)
                    .showDefaultSubmitPage(false)
                    .tokenGenerationSuccessHandler { request, response, token ->
                        request.getSession(true).setAttribute(NativeAccountService.MAGIC, settings.fingerprint(token.tokenValue))
                        response.contentType = "application/json"; response.writer.write("{\"ok\":true}")
                    }
                    .authenticationConverter { request ->
                        val authentication = org.springframework.security.web.authentication.ott.OneTimeTokenAuthenticationConverter().convert(request)
                        val token = authentication as org.springframework.security.authentication.ott.OneTimeTokenAuthenticationToken
                        accounts.requireBrowserLink(token.tokenValue ?: "", request)
                        token
                    }
                    .authenticationSuccessHandler(success).authenticationFailureHandler(failure)
            }
            .logout {
                it.logoutUrl(NativeAuthenticationEndpoints.logout.path).addLogoutHandler { request, response, _ -> sessionIds.expireSession(request, response) }
                    .logoutSuccessHandler { _, response, _ -> response.contentType = "application/json"; response.writer.write("{\"ok\":true}") }
            }
            .authorizeHttpRequests {
                it.dispatcherTypeMatchers(jakarta.servlet.DispatcherType.ERROR).permitAll()
                it.requestMatchers("/actuator/health", NativeAuthenticationEndpoints.login.path, NativeAuthenticationEndpoints.logout.path, "/api/auth/register", "/api/auth/email/verify",
                    "/api/auth/password/reset-request", "/api/auth/password/reset", NativeAuthenticationEndpoints.magic.path, NativeAuthenticationEndpoints.magicVerify.path,
                    NativeAuthenticationEndpoints.passkeyOptions.path, NativeAuthenticationEndpoints.passkeyVerify.path, "/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/api/mcp").permitAll()
                    .anyRequest().authenticated()
            }.exceptionHandling { it.authenticationEntryPoint { _, response, _ ->
                logger.warn("native_auth_failed reason=missing_session")
                response.status = 401; response.contentType = "application/json"; response.setHeader("Cache-Control", "no-store")
                response.writer.write("{\"error\":\"Inloggning krävs.\"}")
            } }
        return http.build()
    }
}
