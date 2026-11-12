package se.forena.api.identity.authentication

import java.nio.charset.StandardCharsets.UTF_8
import java.security.MessageDigest
import java.util.HexFormat
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.authentication.AuthenticationProvider
import org.springframework.security.core.Authentication
import org.springframework.security.oauth2.core.OAuth2AuthenticationException
import org.springframework.security.oauth2.core.OAuth2Error
import org.springframework.security.oauth2.core.OAuth2ErrorCodes
import org.springframework.security.oauth2.server.authorization.OAuth2AuthorizationService
import org.springframework.security.oauth2.server.authorization.OAuth2TokenType
import org.springframework.security.oauth2.server.authorization.authentication.OAuth2AccessTokenAuthenticationToken
import org.springframework.security.oauth2.server.authorization.authentication.OAuth2ClientAuthenticationToken
import org.springframework.security.oauth2.server.authorization.authentication.OAuth2RefreshTokenAuthenticationToken
import org.springframework.transaction.support.TransactionOperations

/** Serialize rotation across instances and revoke the grant when a consumed token is replayed. */
class ReplayProtectedRefreshAuthenticationProvider(
    private val delegate: AuthenticationProvider,
    private val authorizations: OAuth2AuthorizationService,
    private val jdbc: JdbcTemplate,
    private val transactions: TransactionOperations
) : AuthenticationProvider {
    override fun authenticate(authentication: Authentication): Authentication? {
        val request = authentication as OAuth2RefreshTokenAuthenticationToken
        val client = request.principal as? OAuth2ClientAuthenticationToken
        if (client == null || !client.isAuthenticated) invalidClient()
        val clientId = client.registeredClient?.id ?: invalidClient()
        val tokenHash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(request.refreshToken.toByteArray(UTF_8)))

        val outcome = checkNotNull(transactions.execute {
            val current = authorizations.findByToken(request.refreshToken, OAuth2TokenType.REFRESH_TOKEN)
            if (current != null && current.registeredClientId != clientId) invalidGrant()
            val grantId = current?.id ?: jdbc.query(
                "select authorization_id from forena.oauth2_refresh_token_use where token_hash=? and registered_client_id=?",
                { row, _ -> row.getString("authorization_id") }, tokenHash, clientId
            ).singleOrNull() ?: invalidGrant()

            // Both current-token and consumed-token requests must lock the same persisted grant.
            val locked = jdbc.query(
                "select id from forena.oauth2_authorization where id=? and registered_client_id=? for update",
                { row, _ -> row.getString("id") }, grantId, clientId
            ).singleOrNull() ?: invalidGrant()

            // Re-read after acquiring the lock: another instance may just have rotated this token.
            val consumed = jdbc.queryForObject(
                "select exists(select 1 from forena.oauth2_refresh_token_use where token_hash=? and authorization_id=? and registered_client_id=?)",
                Boolean::class.java, tokenHash, locked, clientId
            ) == true
            if (consumed) {
                authorizations.findById(locked)?.let(authorizations::remove)
                return@execute Rotation.Replayed
            }

            val result = delegate.authenticate(request) as? OAuth2AccessTokenAuthenticationToken
                ?: error("Refresh provider did not issue an access token")
            val nextRefresh = result.refreshToken ?: error("Refresh provider did not rotate the refresh token")
            check(nextRefresh.tokenValue != request.refreshToken) { "Refresh token reuse must remain disabled" }
            jdbc.update(
                "insert into forena.oauth2_refresh_token_use(token_hash,authorization_id,registered_client_id) values(?,?,?)",
                tokenHash, locked, clientId
            )
            Rotation.Issued(result)
        })

        // Throw only after commit; otherwise the replay revocation would be rolled back too.
        return when (outcome) {
            Rotation.Replayed -> invalidGrant()
            is Rotation.Issued -> outcome.authentication
        }
    }

    override fun supports(authentication: Class<*>): Boolean = delegate.supports(authentication)

    private sealed interface Rotation {
        data class Issued(val authentication: Authentication) : Rotation
        data object Replayed : Rotation
    }

    private fun invalidClient(): Nothing = throw OAuth2AuthenticationException(OAuth2Error(OAuth2ErrorCodes.INVALID_CLIENT))
    private fun invalidGrant(): Nothing = throw OAuth2AuthenticationException(OAuth2Error(OAuth2ErrorCodes.INVALID_GRANT))
}
