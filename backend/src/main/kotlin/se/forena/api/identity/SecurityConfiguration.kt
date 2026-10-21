package se.forena.api.identity

import java.net.URI
import java.time.Instant
import jakarta.servlet.DispatcherType
import java.util.UUID
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.scheduling.annotation.EnableScheduling
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.oauth2.core.OAuth2Error
import org.springframework.security.oauth2.core.OAuth2TokenValidator
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.jwt.JwtDecoder
import org.springframework.security.oauth2.jwt.JwtValidators
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder
import org.springframework.security.web.SecurityFilterChain
import org.springframework.web.client.RestTemplate
import org.springframework.security.oauth2.server.resource.web.BearerTokenAuthenticationEntryPoint
import org.springframework.security.web.AuthenticationEntryPoint
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter
import org.springframework.security.oauth2.server.resource.web.DefaultBearerTokenResolver
import se.forena.api.http.ApiError
import tools.jackson.databind.json.JsonMapper
import org.slf4j.LoggerFactory

@Configuration
@EnableScheduling
@ConditionalOnWebApplication
class SecurityConfiguration {
    @Bean
    fun decoder(@Value("\${forena.auth.issuer}") issuer: String,
                @Value("\${forena.auth.jwks-uri}") jwks: String,
                requests: AuthHttpRequestFactory): JwtDecoder {
        for (value in listOf(issuer, jwks)) {
            val uri = URI(value)
            require(uri.host != null && uri.userInfo == null && uri.query == null && uri.fragment == null &&
                (uri.scheme == "https" || (uri.scheme == "http" && uri.host in listOf("127.0.0.1", "localhost", "[::1]")))) {
                "Auth endpoints must use HTTPS (HTTP is allowed only on loopback for local tests)"
            }
        }
        val delegate = NimbusJwtDecoder.withJwkSetUri(jwks)
            .restOperations(RestTemplate(requests))
            .jwsAlgorithms { it.clear(); it.addAll(listOf(SignatureAlgorithm.ES256, SignatureAlgorithm.RS256)) }
            .build().also {
                it.setJwtValidator(org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator(
                    JwtValidators.createDefaultWithIssuer(issuer), WebSessionValidator()))
            }
        return AuthJwtDecoder(delegate)
    }

    @Bean
    fun security(http: HttpSecurity, json: JsonMapper, settings: BrowserSessionSettings, sessions: BrowserSessionService): SecurityFilterChain {
        val unauthorized = AuthenticationEntryPoint { request, response, exception ->
            val unavailable = exception is JwtVerificationUnavailable
            if (unavailable) response.status = 503
            else {
                if (request.getHeader("Authorization").isNullOrBlank())
                    LoggerFactory.getLogger(SecurityConfiguration::class.java)
                        .warn("api_auth_failed stage=request reason=missing_bearer")
                BearerTokenAuthenticationEntryPoint().commence(request, response, exception)
            }
            response.contentType = "application/json"
            response.setHeader("Cache-Control", "no-store")
            json.writeValue(response.outputStream, ApiError(if (unavailable)
                "Sessionen kan inte verifieras just nu." else "Inloggning krävs."))
        }
        return http
        // Cookie requests use strict canonical Origin plus a required custom header in BrowserSessionFilter.
        // Bearer-only integrations retain their existing stateless contract.
        .csrf { it.disable() }
        .addFilterBefore(BrowserSessionFilter(settings, sessions, json), BearerTokenAuthenticationFilter::class.java)
        .sessionManagement {
            it.sessionCreationPolicy(SessionCreationPolicy.STATELESS)
            // JWT authentication happens on every request. Only explicit browser login
            // creates a fresh Spring session; re-verifying JWT must not rotate its ID.
            it.sessionFixation { fixation -> fixation.none() }
        }
        .authorizeHttpRequests {
            it.dispatcherTypeMatchers(DispatcherType.ERROR).permitAll()
                .requestMatchers("/actuator/health", "/api/auth/login", "/api/auth/logout", "/api/auth/passkey/options", "/api/auth/passkey/verify").permitAll()
                .anyRequest().authenticated()
        }
        .oauth2ResourceServer {
            val bearer = DefaultBearerTokenResolver()
            it.bearerTokenResolver { request -> request.getAttribute(BrowserSessionFilter.TOKEN_ATTRIBUTE) as String? ?: bearer.resolve(request) }
                .jwt {}.authenticationEntryPoint(unauthorized)
        }
        .build()
    }
}

/** Only verified Supabase web sessions. Claims never grant person or organizational access. */
class WebSessionValidator : OAuth2TokenValidator<Jwt> {
    override fun validate(token: Jwt): OAuth2TokenValidatorResult {
        val valid = runCatching {
            val subject = token.subject
            val session = token.getClaimAsString("session_id")
            UUID.fromString(subject).toString() == subject && UUID.fromString(session).toString() == session &&
                token.audience == listOf("authenticated") && token.getClaimAsString("role") == "authenticated" &&
                token.claims["is_anonymous"] == false &&
                listOf("client_id", "scope", "scopes", "grant_id").none { token.claims.containsKey(it) } &&
                token.expiresAt != null && token.expiresAt!!.isAfter(Instant.now()) &&
                token.issuedAt != null && !token.issuedAt!!.isAfter(Instant.now().plusSeconds(30)) &&
                token.expiresAt!!.isAfter(token.issuedAt)
        }.getOrDefault(false)
        return if (valid) OAuth2TokenValidatorResult.success() else OAuth2TokenValidatorResult.failure(
            OAuth2Error("invalid_token", "A valid authenticated web session is required", null))
    }
}
