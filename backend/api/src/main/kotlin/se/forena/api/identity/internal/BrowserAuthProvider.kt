package se.forena.api.identity.internal

import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpEntity
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpMethod
import org.springframework.http.MediaType
import org.springframework.stereotype.Component
import org.springframework.web.client.HttpStatusCodeException
import org.springframework.web.client.RestClientException
import org.springframework.web.client.RestTemplate
import se.forena.api.identity.AuthHttpRequestFactory
import se.forena.api.identity.InactiveSession
import se.forena.api.identity.SessionVerificationUnavailable
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper

/** Only these fixed provider routes are reachable. Never forward a browser URL or headers. */
@Component
class BrowserAuthProvider(
    @Value("\${forena.auth.issuer}") private val issuer: String,
    @Value("\${forena.auth.publishable-key}") private val key: String,
    requests: AuthHttpRequestFactory, private val json: JsonMapper
) {
    private val client = RestTemplate(requests)
    fun password(email: String, password: String) = post("/token?grant_type=password", mapOf("email" to email, "password" to password))
    fun refresh(token: String) = post("/token?grant_type=refresh_token", mapOf("refresh_token" to token))
    fun options() = post("/passkeys/authentication/options", emptyMap<String, String>())
    fun verify(challenge: String, credential: JsonNode) = post("/passkeys/authentication/verify", mapOf("challenge_id" to challenge, "credential" to credential))
    fun logout(token: String) { post("/logout?scope=local", emptyMap<String, String>(), token) }

    private fun post(path: String, body: Any, bearer: String? = null): JsonNode {
        val headers = HttpHeaders().also {
            it.contentType = MediaType.APPLICATION_JSON
            it.set("apikey", key)
            it.set("Cache-Control", "no-store")
            if (bearer != null) it.setBearerAuth(bearer)
        }
        try {
            val response = client.exchange(issuer + path, HttpMethod.POST, HttpEntity(json.writeValueAsString(body), headers), String::class.java)
            if (response.statusCode.value() == 204) return json.createObjectNode()
            if (response.statusCode.value() != 200) throw SessionVerificationUnavailable()
            return json.readTree(response.body ?: throw SessionVerificationUnavailable())
        } catch (error: HttpStatusCodeException) {
            if (error.statusCode.value() in listOf(400, 401, 403, 422)) throw InactiveSession()
            throw SessionVerificationUnavailable()
        } catch (_: RestClientException) { throw SessionVerificationUnavailable() }
        catch (_: tools.jackson.core.JacksonException) { throw SessionVerificationUnavailable() }
    }
}
