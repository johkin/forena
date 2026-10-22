package se.forena.api.identity.nativeauth

import jakarta.servlet.http.HttpServletRequest
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.http.CacheControl
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.security.authentication.BadCredentialsException
import org.springframework.security.core.Authentication
import org.springframework.security.oauth2.server.authorization.OAuth2TokenType
import org.springframework.security.oauth2.server.authorization.OAuth2AuthorizationService
import org.springframework.security.oauth2.server.authorization.client.RegisteredClientRepository
import org.springframework.security.web.csrf.CsrfToken
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.util.HtmlUtils

@RestController
@ConditionalOnProperty(name = ["forena.auth.mode"], havingValue = "native")
class NativeConsentController(private val grants: OAuth2AuthorizationService, private val clients: RegisteredClientRepository, private val settings: se.forena.api.identity.BrowserSessionSettings) {
    @GetMapping("/api/auth/continue")
    fun resume(request: HttpServletRequest): Map<String, String> {
        val destination = request.getSession(false)?.getAttribute(NativeOAuthConfiguration.RETURN) as? String
        request.getSession(false)?.removeAttribute(NativeOAuthConfiguration.RETURN)
        return mapOf("destination" to (destination?.takeIf { it.startsWith("/oauth2/authorize?") } ?: "/"))
    }
    @GetMapping("/api/auth/oauth/consent")
    fun consent(authentication: Authentication, @RequestParam client_id: String, @RequestParam state: String,
                @RequestParam scope: String, request: HttpServletRequest): NativeConsentView {
        val grant = grants.findByToken(state, OAuth2TokenType("state")) ?: throw BadCredentialsException("Unknown authorization")
        val client = clients.findByClientId(client_id) ?: throw BadCredentialsException("Unknown client")
        if (grant.principalName != authentication.name || grant.registeredClientId != client.id || scope != "mcp:read" || !client.scopes.contains(scope))
            throw BadCredentialsException("Unknown authorization")
        val csrf = request.getAttribute(CsrfToken::class.java.name) as CsrfToken
        return NativeConsentView(client_id, client.clientName, state, scope, settings.origin + "/api/mcp", csrf.parameterName, csrf.token)
    }
}
