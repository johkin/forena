package se.forena.api.identity.internal

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty

import org.springframework.security.authentication.AuthenticationServiceException
import org.springframework.security.authentication.BadCredentialsException
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
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper

/** Only these fixed provider routes are reachable. Never forward a browser URL or headers. */
@Component
@ConditionalOnProperty(name = ["forena.auth.mode"], havingValue = "supabase", matchIfMissing = true)
class BrowserAuthProvider(
    @Value("\${forena.auth.issuer}") private val issuer: String,
    @Value("\${forena.auth.publishable-key}") private val key: String,
    requests: AuthHttpRequestFactory, private val json: JsonMapper
) {
    private val client = RestTemplate(requests)
    fun password(email: String, password: String) = post("/token?grant_type=password", mapOf("email" to email, "password" to password))
    fun refresh(token: String) = post("/token?grant_type=refresh_token", mapOf("refresh_token" to token))
    // Kotlin's EmptyMap needs reflection metadata when Jackson serializes it in native images.
    fun options() = post("/passkeys/authentication/options", json.createObjectNode())
    fun verify(challenge: String, credential: JsonNode) = post("/passkeys/authentication/verify", mapOf("challenge_id" to challenge, "credential" to credential))
    fun registrationOptions(token: String) = post("/passkeys/registration/options", json.createObjectNode(), token)
    fun registrationVerify(token: String, challenge: String, credential: JsonNode) =
        post("/passkeys/registration/verify", mapOf("challenge_id" to challenge, "credential" to credential), token)
    fun magicLink(email: String, challenge: String, callback: String) {
        val redirect = java.net.URLEncoder.encode(callback, java.nio.charset.StandardCharsets.UTF_8)
        post("/otp?redirect_to=$redirect", mapOf("email" to email, "create_user" to false,
            "code_challenge" to challenge, "code_challenge_method" to "s256"))
    }
    fun exchangeCode(code: String, verifier: String) =
        post("/token?grant_type=pkce", mapOf("auth_code" to code, "code_verifier" to verifier))
    fun logout(token: String) { post("/logout?scope=local", json.createObjectNode(), token) }

    private fun post(path: String, body: Any, bearer: String? = null): JsonNode {
        val headers = HttpHeaders().also {
            it.contentType = MediaType.APPLICATION_JSON
            it.set("apikey", key)
            it.set("Cache-Control", "no-store")
            if (bearer != null) it.setBearerAuth(bearer)
        }
        try {
            val response = client.exchange(java.net.URI.create(issuer + path), HttpMethod.POST, HttpEntity(json.writeValueAsString(body), headers), String::class.java)
            if (response.statusCode.value() == 204) return json.createObjectNode()
            if (response.statusCode.value() != 200) throw AuthenticationServiceException("Session verification failed")
            return json.readTree(response.body ?: throw AuthenticationServiceException("Session verification failed"))
        } catch (error: HttpStatusCodeException) {
            if (error.statusCode.value() in listOf(400, 401, 403, 422)) throw BadCredentialsException("Session verification failed")
            throw AuthenticationServiceException("Session verification failed")
        } catch (_: RestClientException) { throw AuthenticationServiceException("Session verification failed") }
        catch (_: tools.jackson.core.JacksonException) { throw AuthenticationServiceException("Session verification failed") }
    }
}
