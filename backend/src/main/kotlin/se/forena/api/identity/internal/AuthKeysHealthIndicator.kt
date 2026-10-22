package se.forena.api.identity.internal

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty

import com.nimbusds.jose.jwk.JWKSet
import javax.net.ssl.SSLException
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication
import org.springframework.boot.health.contributor.Health
import org.springframework.boot.health.contributor.HealthIndicator
import org.springframework.stereotype.Component
import org.springframework.web.client.RestTemplate
import se.forena.api.identity.AuthHttpRequestFactory

/** Release readiness must prove the same HTTPS path needed for JWT verification. */
@Component
@ConditionalOnWebApplication
@ConditionalOnProperty(name = ["forena.auth.mode"], havingValue = "supabase", matchIfMissing = true)
class AuthKeysHealthIndicator(
    @Value("\${forena.auth.jwks-uri}") private val endpoint: String,
    requests: AuthHttpRequestFactory
) : HealthIndicator {
    private val client = RestTemplate(requests)

    override fun health(): Health = try {
        val response = client.getForEntity(endpoint, String::class.java)
        check(response.statusCode.value() == 200)
        val keys = JWKSet.parse(response.body).keys
        check(keys.isNotEmpty() && keys.none { it.isPrivate })
        Health.up().build()
    } catch (error: Exception) {
        // Health is public: never attach provider bodies, URLs or exceptions.
        val tlsFailure = generateSequence<Throwable>(error) { it.cause }.take(16).any { it is SSLException }
        LoggerFactory.getLogger(AuthKeysHealthIndicator::class.java).warn(
            "auth_health_failed reason={}", if (tlsFailure) "jwks_tls" else "jwks_unavailable")
        Health.down().build()
    }
}
