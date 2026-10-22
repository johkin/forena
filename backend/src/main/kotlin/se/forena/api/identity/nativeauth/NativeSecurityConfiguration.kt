package se.forena.api.identity.nativeauth

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
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

class NativeTransportFilter(private val settings: BrowserSessionSettings) : OncePerRequestFilter() {
    override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain) {
        response.setHeader("Cache-Control", "no-store"); response.setHeader("Pragma", "no-cache"); response.setHeader("Referrer-Policy", "no-referrer")
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
            val auth = SecurityContextHolder.getContext().authentication
            val expected = request.getHeader("X-Forena-Account")
            if (auth != null && request.requestURI.startsWith("/api/") &&
                ((expected != null && expected != auth.name) || (!request.requestURI.startsWith("/api/auth/") && request.method !in listOf("GET", "HEAD", "OPTIONS") && expected == null))) {
                fail(response, 401, "Sessionen är inte aktiv."); return
            }
            chain.doFilter(request, response)
        } catch (_: DataAccessException) { if (!response.isCommitted) fail(response, 503, "Sessionen kan inte verifieras just nu.") }
        catch (_: BadCredentialsException) { if (!response.isCommitted) fail(response, 401, "Sessionen är inte aktiv.") }
    }
    private fun fail(response: HttpServletResponse, status: Int, message: String) {
        org.slf4j.LoggerFactory.getLogger(NativeTransportFilter::class.java).warn("native_request_denied status={}", status)
        response.status = status; response.contentType = "application/json"; response.writer.write("{\"error\":\"$message\"}")
    }
}

@Configuration(proxyBeanMethods = false)
@EnableScheduling
@ConditionalOnProperty(name = ["forena.auth.mode"], havingValue = "native")
class NativeSecurityConfiguration {
    @Bean fun nativeCsrfRepository() = StringCsrfTokenRepository()
    @Bean @Order(3)
    fun nativeWebSecurity(http: HttpSecurity, contexts: NativeSessionRepository, csrf: StringCsrfTokenRepository, settings: BrowserSessionSettings): SecurityFilterChain {
        http.securityContext { it.securityContextRepository(contexts) }
            .sessionManagement { it.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED) }
            .requestCache { it.disable() }
            .csrf { it.csrfTokenRepository(csrf).ignoringRequestMatchers("/api/**") }
            .addFilterAfter(NativeTransportFilter(settings), SecurityContextHolderFilter::class.java)
            .authorizeHttpRequests {
                it.dispatcherTypeMatchers(jakarta.servlet.DispatcherType.ERROR).permitAll()
                it.requestMatchers("/actuator/health", "/api/auth/login", "/api/auth/logout", "/api/auth/register", "/api/auth/email/verify",
                    "/api/auth/password/reset-request", "/api/auth/password/reset", "/api/auth/magic-link", "/api/auth/magic-link/verify",
                    "/api/auth/passkey/options", "/api/auth/passkey/verify", "/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/api/mcp").permitAll()
                    .anyRequest().authenticated()
            }.exceptionHandling { it.authenticationEntryPoint { _, response, _ ->
                org.slf4j.LoggerFactory.getLogger(NativeSecurityConfiguration::class.java).warn("native_auth_failed reason=missing_session")
                response.status = 401; response.contentType = "application/json"; response.setHeader("Cache-Control", "no-store")
                response.writer.write("{\"error\":\"Inloggning krävs.\"}")
            } }
        return http.build()
    }
}
