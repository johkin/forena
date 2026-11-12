package se.forena.api.identity.authentication

import jakarta.servlet.FilterChain
import jakarta.servlet.ReadListener
import jakarta.servlet.ServletInputStream
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletRequestWrapper
import jakarta.servlet.http.HttpServletResponse
import java.io.BufferedReader
import java.io.ByteArrayInputStream
import java.io.InputStreamReader
import java.net.URI
import java.util.Locale
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.annotation.Order
import org.springframework.http.MediaType
import org.springframework.security.authentication.AuthenticationServiceException
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.configurers.oauth2.server.authorization.OAuth2AuthorizationServerConfigurer
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.security.oauth2.core.OAuth2AuthenticationException
import org.springframework.security.oauth2.core.OAuth2Error
import org.springframework.security.oauth2.server.authorization.OAuth2AuthorizationService
import org.springframework.security.oauth2.server.authorization.OAuth2ClientRegistration
import org.springframework.security.oauth2.server.authorization.authentication.OAuth2ClientRegistrationAuthenticationContext
import org.springframework.security.oauth2.server.authorization.authentication.OAuth2ClientRegistrationAuthenticationProvider
import org.springframework.security.oauth2.server.authorization.authentication.OAuth2ClientRegistrationAuthenticationToken
import org.springframework.security.oauth2.server.authorization.client.RegisteredClientRepository
import org.springframework.security.oauth2.server.authorization.converter.OAuth2ClientRegistrationRegisteredClientConverter
import org.springframework.security.oauth2.server.authorization.settings.AuthorizationServerSettings
import org.springframework.security.oauth2.server.authorization.settings.OAuth2TokenFormat
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.context.NullSecurityContextRepository
import org.springframework.security.web.context.SecurityContextHolderFilter
import org.springframework.web.ErrorResponseException
import org.springframework.web.filter.OncePerRequestFilter
import se.forena.api.identity.BrowserLoginLimiter

/** Native RFC 7591 registration gets its own chain so browser cookies never load a session. */
@Configuration(proxyBeanMethods = false)
class McpClientRegistrationConfiguration {
    @Bean
    @Order(0)
    fun clientRegistrationSecurity(
        http: HttpSecurity,
        clients: RegisteredClientRepository,
        grants: OAuth2AuthorizationService,
        server: AuthorizationServerSettings,
        passwords: PasswordEncoder,
        limiter: BrowserLoginLimiter,
    ): SecurityFilterChain {
        val configurer = OAuth2AuthorizationServerConfigurer()
        http.securityMatcher(McpClientRegistrationPolicy.ENDPOINT)
            .with(configurer) { serverConfigurer ->
                serverConfigurer.registeredClientRepository(clients)
                    .authorizationService(grants)
                    .authorizationServerSettings(server)
                    .clientRegistrationEndpoint { endpoint ->
                        endpoint.openRegistrationAllowed(true)
                            .authenticationProviders { providers ->
                                providers.filterIsInstance<OAuth2ClientRegistrationAuthenticationProvider>()
                                    .forEach { McpClientRegistrationPolicy.configure(it, passwords) }
                            }
                            .errorResponseHandler { _, response, failure ->
                                val code = (failure as? OAuth2AuthenticationException)?.error?.errorCode
                                val allowed = setOf("invalid_request", "invalid_client_metadata", "invalid_redirect_uri", "invalid_scope")
                                registrationError(response, 400, code?.takeIf { it in allowed } ?: "invalid_client_metadata")
                            }
                    }
            }
            .securityContext { it.securityContextRepository(NullSecurityContextRepository()) }
            .sessionManagement { it.sessionCreationPolicy(SessionCreationPolicy.STATELESS) }
            .requestCache { it.disable() }
            .csrf { it.disable() }
            .addFilterBefore(McpClientRegistrationFilter(limiter), SecurityContextHolderFilter::class.java)
            .authorizeHttpRequests { it.anyRequest().permitAll() }
        return http.build()
    }
}

/** Förena's read-only client policy; Spring still parses, generates credentials and persists clients. */
internal object McpClientRegistrationPolicy {
    const val ENDPOINT = "/oauth2/register"
    const val SCOPE = "mcp:read"
    val AUTHENTICATION_METHODS = listOf("none", "client_secret_basic", "client_secret_post")
    private val GRANT_TYPES = setOf("authorization_code", "refresh_token")
    private val FORBIDDEN_METADATA = setOf(
        "jwks", "jwks_uri", "software_statement", "subject_type", "sector_identifier_uri", "request_uris",
        "token_endpoint_auth_signing_alg", "client_id", "client_secret", "client_id_issued_at", "client_secret_expires_at",
        "registration_access_token", "registration_client_uri",
    )

    fun configure(provider: OAuth2ClientRegistrationAuthenticationProvider, passwords: PasswordEncoder) {
        provider.setPasswordEncoder(passwords)
        provider.setAuthenticationValidator(::validate)
        val converter = OAuth2ClientRegistrationRegisteredClientConverter().apply {
            setTokenSettingsCustomizer { settings ->
                settings.accessTokenFormat(OAuth2TokenFormat.REFERENCE)
                    .accessTokenTimeToLive(McpOAuthPolicy.ACCESS_TOKEN_TTL)
                    .reuseRefreshTokens(false)
                    .refreshTokenTimeToLive(McpOAuthPolicy.REFRESH_TOKEN_TTL)
            }
        }
        provider.setRegisteredClientConverter { registration ->
            val authentication = registration.tokenEndpointAuthenticationMethod ?: "client_secret_basic"
            // Client-supplied names and URLs do not constitute a verified client identity.
            val normalized = OAuth2ClientRegistration.builder()
                .clientName("Extern MCP-klient")
                .tokenEndpointAuthenticationMethod(authentication)
                .redirectUris { it.addAll(registration.redirectUris.orEmpty()) }
                // Explicit server policy; return the effective grants per RFC 7591 section 3.2.1.
                .grantTypes { it.addAll(listOf("authorization_code", "refresh_token")) }
                .responseType("code")
                .scope(SCOPE)
                .build()
            converter.convert(normalized)
        }
    }

    private fun validate(context: OAuth2ClientRegistrationAuthenticationContext) {
        val registration = context.getAuthentication<OAuth2ClientRegistrationAuthenticationToken>().clientRegistration
        if (registration.claims.keys.any { it in FORBIDDEN_METADATA || it.startsWith("id_token_") || it.startsWith("userinfo_") || it.startsWith("request_object_") }) {
            invalidMetadata()
        }
        val name = registration.clientName
        if (name != null && (name.length > 100 || name.any { it.isISOControl() })) invalidMetadata()
        val authentication = registration.tokenEndpointAuthenticationMethod ?: "client_secret_basic"
        if (authentication !in AUTHENTICATION_METHODS) invalidMetadata()
        val grants = if ("grant_types" in registration.claims) registration.grantTypes.orEmpty() else listOf("authorization_code")
        if (grants.size > 2 || grants.distinct().size != grants.size || "authorization_code" !in grants || grants.any { it !in GRANT_TYPES }) {
            invalidMetadata()
        }
        val responses = if ("response_types" in registration.claims) registration.responseTypes.orEmpty() else listOf("code")
        if (responses != listOf("code")) invalidMetadata()
        val scopes = registration.scopes.orEmpty()
        if ("scope" in registration.claims && scopes != listOf(SCOPE)) invalidMetadata()
        val redirects = registration.redirectUris.orEmpty()
        if (redirects.size !in 1..10 || redirects.distinct().size != redirects.size) invalidRedirect()
        // JdbcRegisteredClientRepository persists the set as a comma-separated varchar(1000).
        if (redirects.sumOf { it.length } + redirects.size - 1 > 1000) invalidRedirect()
        redirects.forEach(::validateRedirect)
    }

    private fun validateRedirect(value: String) {
        if (value.length > 2048 || '*' in value || ',' in value) invalidRedirect()
        val uri = try { URI(value) } catch (_: IllegalArgumentException) { invalidRedirect() }
            catch (_: java.net.URISyntaxException) { invalidRedirect() }
        val scheme = uri.scheme?.lowercase(Locale.ROOT)
        val host = uri.host?.lowercase(Locale.ROOT)
        val loopback = host in setOf("localhost", "127.0.0.1", "[::1]", "::1")
        if (host == null || (uri.port != -1 && uri.port !in 1..65535) || uri.rawAuthority != uri.authority || uri.userInfo != null || uri.fragment != null ||
            (scheme != "https" && !(scheme == "http" && loopback))) {
            invalidRedirect()
        }
    }

    private fun invalidMetadata(): Nothing =
        throw OAuth2AuthenticationException(OAuth2Error("invalid_client_metadata"))

    private fun invalidRedirect(): Nothing =
        throw OAuth2AuthenticationException(OAuth2Error("invalid_redirect_uri"))
}

/** Limit admissions before parsing metadata, writing clients or consulting browser sessions. */
private class McpClientRegistrationFilter(private val limiter: BrowserLoginLimiter) : OncePerRequestFilter() {
    override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain) {
        response.setHeader("Cache-Control", "no-store")
        response.setHeader("Referrer-Policy", "no-referrer")
        if (request.method != "POST") {
            response.setHeader("Allow", "POST")
            registrationError(response, 405, "invalid_request")
            return
        }
        try {
            limiter.admit("oauth-registration:${limiter.client(request)}")
        } catch (failure: ErrorResponseException) {
            failure.headers.forEach { name, values -> values.forEach { response.addHeader(name, it) } }
            registrationError(response, failure.statusCode.value(), "temporarily_unavailable")
            return
        } catch (_: AuthenticationServiceException) {
            registrationError(response, 503, "temporarily_unavailable")
            return
        }
        val contentType = runCatching { MediaType.parseMediaType(request.contentType.orEmpty()) }.getOrNull()
        if (contentType == null || contentType.type != "application" || contentType.subtype != "json") {
            registrationError(response, 415, "invalid_request")
            return
        }
        if (request.contentLengthLong > MAX_BODY_BYTES) {
            registrationError(response, 413, "invalid_request")
            return
        }
        try {
            val body = request.inputStream.readNBytes(MAX_BODY_BYTES + 1)
            if (body.size > MAX_BODY_BYTES) {
                registrationError(response, 413, "invalid_request")
                return
            }
            chain.doFilter(RegistrationRequest(request, body), response)
        } catch (_: Exception) {
            if (!response.isCommitted) registrationError(response, 503, "temporarily_unavailable")
        }
    }

    private companion object {
        const val MAX_BODY_BYTES = 16 * 1024
    }
}

private fun registrationError(response: HttpServletResponse, status: Int, code: String) {
    response.status = status
    response.contentType = "application/json;charset=UTF-8"
    response.writer.write("{\"error\":\"$code\"}")
}

private class RegistrationRequest(request: HttpServletRequest, private val body: ByteArray) : HttpServletRequestWrapper(request) {
    override fun getContentLength(): Int = body.size

    override fun getContentLengthLong(): Long = body.size.toLong()

    override fun getInputStream(): ServletInputStream = RegistrationInputStream(body)

    override fun getReader(): BufferedReader = BufferedReader(InputStreamReader(inputStream, characterEncoding ?: "UTF-8"))
}

private class RegistrationInputStream(body: ByteArray) : ServletInputStream() {
    private val source = ByteArrayInputStream(body)

    override fun read(): Int = source.read()

    override fun read(bytes: ByteArray, offset: Int, length: Int): Int = source.read(bytes, offset, length)

    override fun isFinished(): Boolean = source.available() == 0

    override fun isReady(): Boolean = true

    override fun setReadListener(listener: ReadListener) {
        throw IllegalStateException("Registration request bodies are read synchronously")
    }
}
