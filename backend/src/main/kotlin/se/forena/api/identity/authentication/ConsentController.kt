package se.forena.api.identity.authentication

import jakarta.servlet.http.HttpServletRequest
import org.springframework.security.authentication.BadCredentialsException
import org.springframework.security.core.Authentication
import org.springframework.security.oauth2.server.authorization.OAuth2AuthorizationService
import org.springframework.security.oauth2.server.authorization.OAuth2TokenType
import org.springframework.security.oauth2.server.authorization.client.RegisteredClientRepository
import org.springframework.security.web.csrf.CsrfToken
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import se.forena.api.identity.BrowserSessionSettings

@RestController
class ConsentController(private val grants: OAuth2AuthorizationService, private val clients: RegisteredClientRepository, private val settings: BrowserSessionSettings) {
    @GetMapping("/api/auth/continue")
    fun resume(request: HttpServletRequest): Map<String, String> {
        val destination = request.getSession(false)?.getAttribute(OAuthConfiguration.RETURN) as? String
        request.getSession(false)?.removeAttribute(OAuthConfiguration.RETURN)
        return mapOf("destination" to (destination?.takeIf { it.startsWith("/oauth2/authorize?") } ?: "/"))
    }
    @GetMapping("/api/auth/oauth/consent")
    fun consent(authentication: Authentication, @RequestParam client_id: String, @RequestParam state: String,
                @RequestParam scope: String, request: HttpServletRequest): ConsentView {
        val grant = grants.findByToken(state, OAuth2TokenType("state")) ?: throw BadCredentialsException("Unknown authorization")
        val client = clients.findByClientId(client_id) ?: throw BadCredentialsException("Unknown client")
        if (grant.principalName != authentication.name || grant.registeredClientId != client.id || scope != "mcp:read" || !client.scopes.contains(scope))
            throw BadCredentialsException("Unknown authorization")
        val csrf = request.getAttribute(CsrfToken::class.java.name) as CsrfToken
        return ConsentView(client_id, client.clientName, state, scope, settings.origin + "/api/mcp", csrf.parameterName, csrf.token)
    }
}
