package se.forena.api.identity.authentication

import org.springframework.security.core.Authentication
import org.springframework.security.crypto.keygen.Base64StringKeyGenerator
import org.springframework.security.oauth2.core.AuthorizationGrantType
import org.springframework.security.oauth2.core.ClientAuthenticationMethod
import org.springframework.security.oauth2.core.OAuth2RefreshToken
import org.springframework.security.oauth2.server.authorization.OAuth2TokenType
import org.springframework.security.oauth2.server.authorization.authentication.OAuth2ClientAuthenticationToken
import org.springframework.security.oauth2.server.authorization.token.OAuth2RefreshTokenGenerator
import org.springframework.security.oauth2.server.authorization.token.OAuth2TokenContext
import org.springframework.security.oauth2.server.authorization.token.OAuth2TokenGenerator
import java.time.Clock
import java.util.Base64

/** Enable initial public refresh issuance; Spring retains confidential issuance and rotation. */
class PublicClientRefreshTokenGenerator(private val clock: Clock = Clock.systemUTC()) : OAuth2TokenGenerator<OAuth2RefreshToken> {
    private val delegate = OAuth2RefreshTokenGenerator().apply { setClock(clock) }
    private val tokens = Base64StringKeyGenerator(Base64.getUrlEncoder().withoutPadding(), 96)

    override fun generate(context: OAuth2TokenContext): OAuth2RefreshToken? {
        if (context.tokenType != OAuth2TokenType.REFRESH_TOKEN) return null
        val grant = context.getAuthorizationGrant<Authentication>()
        val client = grant?.principal as? OAuth2ClientAuthenticationToken
        if (context.authorizationGrantType != AuthorizationGrantType.AUTHORIZATION_CODE ||
            client?.clientAuthenticationMethod != ClientAuthenticationMethod.NONE) {
            return delegate.generate(context)
        }
        if (!client.isAuthenticated || !supportsPublicRefresh(context.registeredClient)) return null
        val issuedAt = clock.instant()
        return OAuth2RefreshToken(tokens.generateKey(), issuedAt, issuedAt.plus(context.registeredClient.tokenSettings.refreshTokenTimeToLive))
    }
}
