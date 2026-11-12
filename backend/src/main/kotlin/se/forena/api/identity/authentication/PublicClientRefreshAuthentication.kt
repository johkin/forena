package se.forena.api.identity.authentication

import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.security.authentication.AuthenticationProvider
import org.springframework.security.core.Authentication
import org.springframework.security.core.Transient
import org.springframework.security.oauth2.core.AuthorizationGrantType
import org.springframework.security.oauth2.core.ClientAuthenticationMethod
import org.springframework.security.oauth2.core.OAuth2AuthenticationException
import org.springframework.security.oauth2.core.OAuth2Error
import org.springframework.security.oauth2.core.OAuth2ErrorCodes
import org.springframework.security.oauth2.core.endpoint.OAuth2ParameterNames
import org.springframework.security.oauth2.server.authorization.authentication.OAuth2ClientAuthenticationToken
import org.springframework.security.oauth2.server.authorization.client.RegisteredClient
import org.springframework.security.oauth2.server.authorization.client.RegisteredClientRepository
import org.springframework.security.web.authentication.AuthenticationConverter
import java.util.Collections

/** Identify public refresh requests while retaining Spring's confidential-client authentication. */
class PublicClientRefreshAuthenticationConverter(private val tokenEndpoint: String = "/oauth2/token") : AuthenticationConverter {
    override fun convert(request: HttpServletRequest): Authentication? {
        if (request.method != "POST" || request.requestURI != request.contextPath + tokenEndpoint) return null
        val grants = request.getParameterValues(OAuth2ParameterNames.GRANT_TYPE) ?: return null
        if (AuthorizationGrantType.REFRESH_TOKEN.value !in grants) return null
        if (grants.size != 1) invalidRequest()

        val authorization = Collections.list(request.getHeaders(HttpHeaders.AUTHORIZATION))
        val secrets = request.getParameterValues(OAuth2ParameterNames.CLIENT_SECRET)
        if (authorization.size > 1 || (authorization.isNotEmpty() && secrets != null)) invalidRequest()
        if (request.getParameter("client_assertion") != null || request.getParameter("client_assertion_type") != null) invalidRequest()
        if (authorization.isNotEmpty()) {
            if (!authorization.single().substringBefore(' ').equals("Basic", ignoreCase = true)) invalidRequest()
            return null
        }
        if (secrets != null) {
            if (secrets.size != 1 || secrets.single().isBlank()) invalidRequest()
            return null
        }

        val contentType = try { MediaType.parseMediaType(request.contentType.orEmpty()) }
            catch (_: IllegalArgumentException) { invalidRequest() }
        if (!MediaType.APPLICATION_FORM_URLENCODED.isCompatibleWith(contentType) || !request.queryString.isNullOrEmpty()) invalidRequest()
        val clientId = requiredParameter(request, OAuth2ParameterNames.CLIENT_ID)
        requiredParameter(request, OAuth2ParameterNames.REFRESH_TOKEN)
        return PublicClientRefreshAuthenticationToken(clientId)
    }

    private fun requiredParameter(request: HttpServletRequest, name: String): String {
        val values = request.getParameterValues(name) ?: invalidRequest()
        if (values.size != 1 || values.single().isBlank()) invalidRequest()
        return values.single()
    }

    private fun invalidRequest(): Nothing = throw OAuth2AuthenticationException(OAuth2Error(OAuth2ErrorCodes.INVALID_REQUEST))
}

/** Spring's refresh grant provider still validates the token, client binding, scope and expiry. */
class PublicClientRefreshAuthenticationProvider(private val clients: RegisteredClientRepository) : AuthenticationProvider {
    override fun authenticate(authentication: Authentication): Authentication? {
        if (authentication !is PublicClientRefreshAuthenticationToken) return null
        val client = clients.findByClientId(authentication.principal.toString())
        if (client == null || !supportsPublicRefresh(client)) {
            throw OAuth2AuthenticationException(OAuth2Error(OAuth2ErrorCodes.INVALID_CLIENT))
        }
        return OAuth2ClientAuthenticationToken(client, ClientAuthenticationMethod.NONE, null)
    }

    override fun supports(authentication: Class<*>): Boolean =
        PublicClientRefreshAuthenticationToken::class.java.isAssignableFrom(authentication)
}

internal fun supportsPublicRefresh(client: RegisteredClient): Boolean =
    client.clientAuthenticationMethods == setOf(ClientAuthenticationMethod.NONE) &&
        client.clientSettings.isRequireProofKey &&
        client.authorizationGrantTypes.containsAll(setOf(AuthorizationGrantType.AUTHORIZATION_CODE, AuthorizationGrantType.REFRESH_TOKEN)) &&
        client.scopes == setOf(McpClientRegistrationPolicy.SCOPE)

@Transient
private class PublicClientRefreshAuthenticationToken(clientId: String) :
    OAuth2ClientAuthenticationToken(clientId, ClientAuthenticationMethod.NONE, null, null)
