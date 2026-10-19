package se.forena.api.identity.internal

import java.net.URI
import java.net.HttpURLConnection
import java.time.Duration
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpEntity
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpMethod
import org.springframework.http.client.SimpleClientHttpRequestFactory
import org.springframework.stereotype.Service
import org.springframework.web.client.HttpStatusCodeException
import org.springframework.web.client.RestClientException
import org.springframework.web.client.RestTemplate
import se.forena.api.identity.Actor
import se.forena.api.identity.InactiveSession
import se.forena.api.identity.ProviderSessionVerifier
import se.forena.api.identity.SessionVerificationUnavailable
import tools.jackson.databind.json.JsonMapper

/** Online provider check, without admin credentials, cache, retries or Auth-table access. */
@Service
class SupabaseSessionService(
    @Value("\${forena.auth.issuer}") issuer: String,
    @Value("\${forena.auth.publishable-key}") private val publishableKey: String,
    private val json: JsonMapper
) : ProviderSessionVerifier {
    private val endpoint = issuer + "/user"
    private val client = RestTemplate(object : SimpleClientHttpRequestFactory() {
        override fun prepareConnection(connection: HttpURLConnection, httpMethod: String) {
            super.prepareConnection(connection, httpMethod)
            connection.instanceFollowRedirects = false
        }
    }.also {
        it.setConnectTimeout(Duration.ofSeconds(2))
        it.setReadTimeout(Duration.ofSeconds(2))
    })

    init {
        // Migration-only mode has no issuer. The web JwtDecoder rejects an absent issuer.
        if (issuer.isNotBlank()) {
            val uri = URI(issuer)
            require(uri.host != null && uri.userInfo == null && uri.query == null && uri.fragment == null &&
                (uri.scheme == "https" || (uri.scheme == "http" && uri.host in listOf("127.0.0.1", "localhost", "[::1]"))))
            require(publishableKey.startsWith("sb_publishable_") && publishableKey.none { it.isWhitespace() }) {
                "Configure the target project's publishable key, never an Auth secret or service-role key"
            }
        }
    }

    override fun requireActive(actor: Actor) {
        val headers = HttpHeaders().also {
            it.setBearerAuth(actor.bearerToken)
            it.set("apikey", publishableKey)
            it.set("Cache-Control", "no-store")
        }
        val body = try {
            val result = client.exchange(endpoint, HttpMethod.GET, HttpEntity<Void>(headers), String::class.java)
            if (result.statusCode.value() != 200) throw SessionVerificationUnavailable()
            result.body
        } catch (error: HttpStatusCodeException) {
            val code = runCatching { json.readTree(error.responseBodyAsString).get("error_code")?.asString() }.getOrNull()
            if (error.statusCode.value() in listOf(401,403) && code in setOf(
                    "bad_jwt", "session_not_found", "user_not_found", "user_banned", "session_expired"))
                throw InactiveSession()
            throw SessionVerificationUnavailable()
        } catch (_: RestClientException) {
            throw SessionVerificationUnavailable()
        }
        val user = runCatching { json.readTree(body ?: "") }.getOrNull()
            ?: throw SessionVerificationUnavailable()
        if (user.get("id")?.asString() != actor.subject.toString() || user.get("is_anonymous")?.asBoolean() != false)
            throw InactiveSession()
    }
}
