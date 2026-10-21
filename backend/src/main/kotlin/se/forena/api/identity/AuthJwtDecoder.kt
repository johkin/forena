package se.forena.api.identity

import org.springframework.security.oauth2.core.OAuth2AuthenticationException
import org.springframework.security.oauth2.core.OAuth2Error
import java.io.IOException
import java.net.SocketTimeoutException
import javax.net.ssl.SSLException
import org.slf4j.LoggerFactory
import org.springframework.security.oauth2.jwt.BadJwtException
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.jwt.JwtDecoder
import org.springframework.security.oauth2.jwt.JwtException
import org.springframework.security.oauth2.jwt.JwtValidationException
import org.springframework.web.client.RestClientException
import org.springframework.web.client.RestClientResponseException

/** Fail closed without treating an unavailable key provider as a revoked session. */
class AuthJwtDecoder(private val delegate: JwtDecoder) : JwtDecoder {
    override fun decode(token: String): Jwt = try {
        delegate.decode(token)
    } catch (error: JwtException) {
        val causes = generateSequence<Throwable>(error) { it.cause }.take(16).toList()
        val reason = when {
            causes.any { it is SSLException } -> "jwks_tls"
            causes.any { it is SocketTimeoutException } -> "jwks_timeout"
            causes.any { it is RestClientResponseException } -> "jwks_http"
            causes.any { it is IOException || it is RestClientException } -> "jwks_transport"
            error is JwtValidationException -> "invalid_claims"
            error is BadJwtException -> "invalid_token"
            else -> "jwt_rejected"
        }
        // Never log the token, exception message, URL, claims or stack trace.
        log.warn("api_auth_failed stage=jwt reason={}", reason)
        if (reason.startsWith("jwks_")) throw OAuth2AuthenticationException(OAuth2Error("temporarily_unavailable"))
        throw BadJwtException("Token could not be verified")
    }

    private companion object {
        val log = LoggerFactory.getLogger(AuthJwtDecoder::class.java)
    }
}
