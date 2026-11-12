package se.forena.api.identity.authentication

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import java.net.URI
import java.net.URLEncoder
import java.nio.charset.StandardCharsets.UTF_8
import java.util.UUID
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.ApplicationRunner
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.annotation.Order
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.authentication.AuthenticationServiceException
import org.springframework.security.authentication.BadCredentialsException
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.configurers.oauth2.server.authorization.OAuth2AuthorizationServerConfigurer
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.core.Authentication
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.security.oauth2.core.AuthorizationGrantType
import org.springframework.security.oauth2.core.ClientAuthenticationMethod
import org.springframework.security.oauth2.core.DefaultOAuth2AuthenticatedPrincipal
import org.springframework.security.oauth2.core.OAuth2AuthenticationException
import org.springframework.security.oauth2.core.OAuth2Error
import org.springframework.security.oauth2.core.OAuth2ErrorCodes
import org.springframework.security.oauth2.server.authorization.JdbcOAuth2AuthorizationConsentService
import org.springframework.security.oauth2.server.authorization.JdbcOAuth2AuthorizationService
import org.springframework.security.oauth2.server.authorization.OAuth2AuthorizationConsentService
import org.springframework.security.oauth2.server.authorization.OAuth2AuthorizationService
import org.springframework.security.oauth2.server.authorization.OAuth2TokenType
import org.springframework.security.oauth2.server.authorization.authentication.OAuth2RefreshTokenAuthenticationProvider
import org.springframework.security.oauth2.server.authorization.client.JdbcRegisteredClientRepository
import org.springframework.security.oauth2.server.authorization.client.RegisteredClient
import org.springframework.security.oauth2.server.authorization.client.RegisteredClientRepository
import org.springframework.security.oauth2.server.authorization.settings.AuthorizationServerSettings
import org.springframework.security.oauth2.server.authorization.settings.ClientSettings
import org.springframework.security.oauth2.server.authorization.settings.OAuth2TokenFormat
import org.springframework.security.oauth2.server.authorization.settings.TokenSettings
import org.springframework.security.oauth2.server.authorization.token.DelegatingOAuth2TokenGenerator
import org.springframework.security.oauth2.server.authorization.token.OAuth2AccessTokenGenerator
import org.springframework.security.oauth2.server.authorization.token.OAuth2TokenGenerator
import org.springframework.security.oauth2.server.resource.introspection.BadOpaqueTokenException
import org.springframework.security.oauth2.server.resource.introspection.OpaqueTokenIntrospector
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.context.NullSecurityContextRepository
import org.springframework.security.web.context.SecurityContextHolderFilter
import org.springframework.security.web.csrf.CsrfFilter
import org.springframework.web.ErrorResponseException
import org.springframework.web.filter.OncePerRequestFilter
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.support.TransactionTemplate
import se.forena.api.identity.BrowserLoginLimiter
import se.forena.api.identity.BrowserSessionSettings

/** Enforce the MCP resource on issuance, not a caller-supplied token audience. */
class ResourceFilter(private val resource: String, private val limiter: BrowserLoginLimiter) : OncePerRequestFilter() {
    override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain) {
        response.setHeader("Cache-Control", "no-store")
        val authorizationRequest = request.requestURI == "/oauth2/authorize" && request.method in setOf("GET", "POST")
        val tokenRequest = request.method == "POST" && request.requestURI in setOf("/oauth2/token", "/oauth2/introspect", "/oauth2/revoke")
        // Run before SecurityContext/CSRF or the login entry point can create a session.
        // Apply to existing cookies too: a caller-supplied cookie is not an admission pass.
        if (authorizationRequest || tokenRequest) {
            try {
                val client = limiter.client(request)
                limiter.admit(if (authorizationRequest) "oauth-authorization:$client" else client)
            }
            catch (error: ErrorResponseException) {
                response.status = error.statusCode.value(); error.headers.forEach { name, values -> values.forEach { response.addHeader(name, it) } }
                unavailable(response); return
            }
            catch (_: AuthenticationServiceException) {
                response.status = 503
                unavailable(response); return
            }
        }
        if (request.method == "POST" && request.requestURI == "/oauth2/authorize" && request.getHeader("Origin") !in listOf(null, "null", resource.removeSuffix("/api/mcp"))) {
            response.status = 403; return
        }
        if ((request.requestURI == "/oauth2/authorize" || request.requestURI == "/oauth2/token") &&
            request.method in listOf("GET", "POST") && request.getParameterValues("resource")?.toList() != listOf(resource)) {
            response.status = 400; response.contentType = "application/json;charset=UTF-8"; response.setHeader("Cache-Control", "no-store")
            response.writer.write("{\"error\":\"invalid_target\"}"); return
        }
        response.setHeader("Cache-Control", "no-store"); response.setHeader("Referrer-Policy", "no-referrer")
        chain.doFilter(request, response)
    }

    private fun unavailable(response: HttpServletResponse) {
        response.contentType = "application/json;charset=UTF-8"
        response.writer.write("{\"error\":\"temporarily_unavailable\"}")
    }
}

/** Authorization Server excludes its protocol endpoints from the default CSRF filter.
 * Apply Spring's CSRF verification explicitly to the browser consent POST. */
class ConsentCsrfFilter(repository: StringCsrfTokenRepository) : OncePerRequestFilter() {
    private val delegate = CsrfFilter(repository).apply {
        setBeanName("oAuthConsentCsrf")
        setRequireCsrfProtectionMatcher { it.method == "POST" && it.requestURI == "/oauth2/authorize" }
    }
    override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain) = delegate.doFilter(request, response, chain)
}

@Configuration(proxyBeanMethods = false)
class OAuthConfiguration {
    @Bean fun clients(jdbc: JdbcTemplate): RegisteredClientRepository = JdbcRegisteredClientRepository(jdbc)
    @Bean fun authorizations(jdbc: JdbcTemplate, clients: RegisteredClientRepository): OAuth2AuthorizationService = JdbcOAuth2AuthorizationService(jdbc, clients)
    @Bean fun consents(jdbc: JdbcTemplate, clients: RegisteredClientRepository): OAuth2AuthorizationConsentService = JdbcOAuth2AuthorizationConsentService(jdbc, clients)
    @Bean fun authorizationServerSettings(settings: BrowserSessionSettings) = AuthorizationServerSettings.builder()
        .issuer(settings.origin).clientRegistrationEndpoint(McpClientRegistrationPolicy.ENDPOINT).build()
    @Bean fun tokenGenerator(accounts: AccountService, settings: BrowserSessionSettings): OAuth2TokenGenerator<*> {
        val generator = OAuth2AccessTokenGenerator()
        generator.setAccessTokenCustomizer { context ->
            val principal = context.getPrincipal<Authentication>() ?: throw OAuth2AuthenticationException(OAuth2Error(OAuth2ErrorCodes.INVALID_GRANT))
            val user = try { accounts.requireUser(UUID.fromString(principal.name)) }
                catch (_: BadCredentialsException) { throw OAuth2AuthenticationException(OAuth2Error(OAuth2ErrorCodes.INVALID_GRANT)) }
            if (principal.authorities.none { it.authority == "AUTH_VERSION_${user.authVersion}" })
                throw OAuth2AuthenticationException(OAuth2Error(OAuth2ErrorCodes.INVALID_GRANT))
            context.claims.subject(user.subject.toString()).audience(listOf(settings.origin + "/api/mcp")).claim("auth_version", user.authVersion.toString())
        }
        return DelegatingOAuth2TokenGenerator(generator, PublicClientRefreshTokenGenerator())
    }
    @Bean fun configureOAuthClient(clients: RegisteredClientRepository, passwords: PasswordEncoder,
        @Value("\${forena.authentication.client-id:}") clientId: String, @Value("\${forena.authentication.client-redirect:}") redirect: String,
        @Value("\${forena.authentication.client-secret:}") secret: String) = ApplicationRunner {
        if (clientId.isBlank()) { require(redirect.isBlank() && secret.isBlank()); return@ApplicationRunner }
        require(clientId.length <= 100 && clientId.none { it.isWhitespace() })
        val uri = URI(redirect)
        require(uri.host != null && uri.userInfo == null && uri.fragment == null &&
            (uri.scheme == "https" || (uri.scheme == "http" && uri.host in listOf("localhost", "127.0.0.1"))))
        require(secret.isBlank() || secret.toByteArray(UTF_8).size in 32..72) { "OAuth client secrets must have 32 to 72 UTF-8 bytes" }
        val previous = clients.findByClientId(clientId)
        // Updating an existing client's redirect/secret is an explicit provisioning operation.
        if (previous != null) {
            require(previous.redirectUris == setOf(redirect)) { "Configured redirect differs from registered client" }
            require((secret.isBlank() && previous.clientSecret == null) || (secret.isNotBlank() && passwords.matches(secret, previous.clientSecret ?: ""))) { "Configured OAuth client secret differs" }
        } else {
            val builder = RegisteredClient.withId(UUID.randomUUID().toString()).clientId(clientId).clientName("Förena MCP")
                .redirectUri(redirect).scope("mcp:read").authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                .authorizationGrantType(AuthorizationGrantType.REFRESH_TOKEN)
                .clientSettings(ClientSettings.builder().requireProofKey(true).requireAuthorizationConsent(true).build())
                .tokenSettings(TokenSettings.builder().accessTokenFormat(OAuth2TokenFormat.REFERENCE).accessTokenTimeToLive(McpOAuthPolicy.ACCESS_TOKEN_TTL)
                    .reuseRefreshTokens(false).refreshTokenTimeToLive(McpOAuthPolicy.REFRESH_TOKEN_TTL).build())
            if (secret.isBlank()) builder.clientAuthenticationMethod(ClientAuthenticationMethod.NONE)
            else builder.clientAuthenticationMethod(ClientAuthenticationMethod.CLIENT_SECRET_BASIC).clientSecret(requireNotNull(passwords.encode(secret)))
            clients.save(builder.build())
        }
    }
    @Bean @Order(1)
    fun authorizationSecurity(http: HttpSecurity, contexts: AccountSecurityContextRepository, csrf: StringCsrfTokenRepository,
        settings: BrowserSessionSettings, limiter: BrowserLoginLimiter, clients: RegisteredClientRepository, grants: OAuth2AuthorizationService,
        consents: OAuth2AuthorizationConsentService, tokens: OAuth2TokenGenerator<*>, server: AuthorizationServerSettings,
        jdbc: JdbcTemplate, transactionManager: PlatformTransactionManager): SecurityFilterChain {
        val config = OAuth2AuthorizationServerConfigurer()
        val refreshTransactions = TransactionTemplate(transactionManager).apply {
            isolationLevel = TransactionDefinition.ISOLATION_READ_COMMITTED
            propagationBehavior = TransactionDefinition.PROPAGATION_REQUIRES_NEW
        }
        http.securityMatcher(config.endpointsMatcher)
            .with(config) { it.registeredClientRepository(clients).authorizationService(grants).authorizationConsentService(consents)
                .tokenGenerator(tokens).authorizationServerSettings(server).authorizationEndpoint { endpoint -> endpoint.consentPage("/oauth/consent") }
                .clientAuthentication { authentication ->
                    authentication.authenticationConverters { converters -> converters.add(0, PublicClientRefreshAuthenticationConverter(server.tokenEndpoint)) }
                    authentication.authenticationProviders { providers -> providers.add(0, PublicClientRefreshAuthenticationProvider(clients)) }
                }
                .tokenEndpoint { endpoint -> endpoint.authenticationProviders { providers ->
                    val index = providers.indexOfFirst { it is OAuth2RefreshTokenAuthenticationProvider }
                    check(index >= 0 && providers.count { it is OAuth2RefreshTokenAuthenticationProvider } == 1) { "Expected one native refresh provider" }
                    providers[index] = ReplayProtectedRefreshAuthenticationProvider(providers[index], grants, jdbc, refreshTransactions)
                } }
                .authorizationServerMetadataEndpoint { endpoint -> endpoint.authorizationServerMetadataCustomizer { metadata ->
                    metadata.clientRegistrationEndpoint(settings.origin + McpClientRegistrationPolicy.ENDPOINT)
                        .scopes { scopes -> scopes.clear(); scopes.add(McpClientRegistrationPolicy.SCOPE) }
                        .grantTypes { grants -> grants.clear(); grants.addAll(listOf("authorization_code", "refresh_token")) }
                        .responseTypes { responses -> responses.clear(); responses.add("code") }
                        .tokenEndpointAuthenticationMethods { methods -> methods.clear(); methods.addAll(McpClientRegistrationPolicy.AUTHENTICATION_METHODS) }
                        .codeChallengeMethods { methods -> methods.clear(); methods.add("S256") }
                } } }
            .securityContext { it.securityContextRepository(contexts) }
            .requestCache { it.disable() }
            .csrf { it.csrfTokenRepository(csrf) }
            .addFilterBefore(ResourceFilter(settings.origin + "/api/mcp", limiter), SecurityContextHolderFilter::class.java)
            .addFilterAfter(ConsentCsrfFilter(csrf), SecurityContextHolderFilter::class.java)
            .authorizeHttpRequests { it.anyRequest().authenticated() }
            .exceptionHandling { it.authenticationEntryPoint { request, response, _ ->
                val destination = request.requestURI + (request.queryString?.let { q -> "?$q" } ?: "")
                request.getSession(true).setAttribute(RETURN, destination)
                response.sendRedirect("/login?next=" + URLEncoder.encode(destination, UTF_8))
            } }
        return http.build()
    }
    @Bean fun introspector(grants: OAuth2AuthorizationService, clients: RegisteredClientRepository, accounts: AccountService,
                                  settings: BrowserSessionSettings) = OpaqueTokenIntrospector { value ->
        val grant = grants.findByToken(value, OAuth2TokenType.ACCESS_TOKEN) ?: throw BadOpaqueTokenException("Invalid token")
        val token = grant.accessToken ?: throw BadOpaqueTokenException("Invalid token")
        val user = try { accounts.requireUser(UUID.fromString(grant.principalName)) }
            catch (_: BadCredentialsException) { throw BadOpaqueTokenException("Inactive account") }
        if (!token.isActive || token.claims?.get("aud") != listOf(settings.origin + "/api/mcp") ||
            token.claims?.get("auth_version")?.toString() != user.authVersion.toString() || clients.findById(grant.registeredClientId) == null)
            throw BadOpaqueTokenException("Invalid token")
        DefaultOAuth2AuthenticatedPrincipal(grant.principalName, mapOf("sub" to grant.principalName, "grant_id" to grant.id),
            token.token.scopes.map { SimpleGrantedAuthority("SCOPE_$it") })
    }
    @Bean @Order(2)
    fun mcpSecurity(http: HttpSecurity, introspector: OpaqueTokenIntrospector, settings: BrowserSessionSettings): SecurityFilterChain {
        return http.securityMatcher("/api/mcp").securityContext { it.securityContextRepository(NullSecurityContextRepository()) }
            .sessionManagement { it.sessionCreationPolicy(SessionCreationPolicy.STATELESS) }.csrf { it.disable() }
            .authorizeHttpRequests { it.anyRequest().hasAuthority("SCOPE_mcp:read") }
            .addFilterAfter(McpRequestFilter(), BearerTokenAuthenticationFilter::class.java)
            .oauth2ResourceServer { it.opaqueToken { opaque -> opaque.introspector(introspector) }.authenticationEntryPoint { _, response, _ ->
                response.status = 401; response.setHeader("Cache-Control", "no-store")
                response.setHeader("WWW-Authenticate", "Bearer resource_metadata=\"${settings.origin}/.well-known/oauth-protected-resource/api/mcp\", scope=\"mcp:read\"")
            } }.build()
    }
    companion object { const val RETURN = "forena.oauth-return" }
}
