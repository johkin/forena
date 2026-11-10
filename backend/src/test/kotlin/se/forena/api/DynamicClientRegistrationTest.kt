package se.forena.api

import java.io.ByteArrayInputStream
import java.net.URI
import java.net.URLDecoder
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.StandardCharsets.UTF_8
import java.security.MessageDigest
import java.time.Duration
import java.util.Base64
import java.util.UUID
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.Arguments
import org.junit.jupiter.params.provider.MethodSource
import org.junit.jupiter.params.provider.ValueSource
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.core.env.Environment
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.security.oauth2.server.authorization.client.RegisteredClientRepository
import org.springframework.security.oauth2.server.authorization.settings.OAuth2TokenFormat
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.testcontainers.postgresql.PostgreSQLContainer
import se.forena.api.identity.BrowserSessionSettings
import tools.jackson.databind.json.JsonMapper

/** A separate installation with no manually provisioned OAuth client or callback. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(AuthTest.MailConfiguration::class)
class DynamicClientRegistrationTest {
    companion object {
        val database = PostgreSQLContainer("postgres:17.6-alpine").withInitScript("init.sql").also { it.start() }

        @JvmStatic
        @DynamicPropertySource
        fun properties(registry: DynamicPropertyRegistry) {
            registry.add("spring.datasource.url") { database.jdbcUrl }
            registry.add("spring.datasource.username") { "forena_api_runtime" }
            registry.add("spring.datasource.password") { "local-runtime-only" }
            registry.add("spring.liquibase.user") { "forena_api_owner" }
            registry.add("spring.liquibase.password") { "local-owner-only" }
            registry.add("forena.web-session.enabled") { true }
            registry.add("forena.web-session.origin") { "https://app.example.invalid" }
            registry.add("forena.web-session.key") { Base64.getEncoder().encodeToString(ByteArray(32) { 7 }) }
            registry.add("forena.email.from") { "Förena <auth@example.invalid>" }
            registry.add("forena.email.resend-api-key") { "synthetic-unused-key" }
            registry.add("forena.authentication.mail-delay-ms") { 3600000 }
            registry.add("forena.authentication.client-id") { "" }
            registry.add("forena.authentication.client-redirect") { "" }
            registry.add("forena.authentication.client-secret") { "" }
        }

        @JvmStatic
        fun invalidMetadata(): List<Arguments> = listOf(
            "client credentials grant" to mapOf("grant_types" to listOf("client_credentials")),
            "password grant" to mapOf("grant_types" to listOf("password")),
            "implicit grant" to mapOf("grant_types" to listOf("implicit")),
            "unknown scope" to mapOf("scope" to "openid"),
            "expanded scope" to mapOf("scope" to "mcp:read openid"),
            "empty scope" to mapOf("scope" to ""),
            "token response" to mapOf("response_types" to listOf("token")),
            "JWT client authentication" to mapOf("token_endpoint_auth_method" to "private_key_jwt"),
            "secret JWT authentication" to mapOf("token_endpoint_auth_method" to "client_secret_jwt"),
            "remote key metadata" to mapOf("jwks_uri" to "http://127.0.0.1:9/never-requested-keys"),
            "caller selected client id" to mapOf("client_id" to "caller-selected-client-id"),
            "caller selected client secret" to mapOf("client_secret" to "caller-selected-synthetic-client-secret"),
            "software statement" to mapOf("software_statement" to "synthetic-unverified-software-statement"),
            "missing callbacks" to mapOf("redirect_uris" to emptyList<String>()),
            "duplicate callbacks" to mapOf("redirect_uris" to listOf("https://client.example.invalid/callback", "https://client.example.invalid/callback")),
            "too many callbacks" to mapOf("redirect_uris" to (1..11).map { "https://client.example.invalid/callback/$it" }),
            "callbacks exceed stored length" to mapOf("redirect_uris" to listOf("https://client.example.invalid/".padEnd(500, 'a'), "https://client.example.invalid/".padEnd(500, 'b'))),
        ).map { (name, metadata) ->
            // Spring rejects empty mandatory metadata and response-only secrets before the policy validator.
            val error = when {
                metadata["scope"] == "" || metadata["redirect_uris"] == emptyList<String>() || "client_secret" in metadata -> "invalid_request"
                "redirect_uris" in metadata -> "invalid_redirect_uri"
                else -> "invalid_client_metadata"
            }
            Arguments.of(name, metadata, error)
        }
    }

    @Autowired lateinit var environment: Environment
    @Autowired lateinit var settings: BrowserSessionSettings
    @Autowired lateinit var json: JsonMapper
    @Autowired lateinit var clients: RegisteredClientRepository
    @Autowired lateinit var passwords: PasswordEncoder
    private val http = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build()
    private val admin by lazy { JdbcTemplate(DriverManagerDataSource(database.jdbcUrl, database.username, database.password)) }
    private val base get() = "http://127.0.0.1:${environment.getRequiredProperty("local.server.port")}"
    private val resource get() = settings.origin + "/api/mcp"
    private val callback = "https://client.example.invalid/callback?installation=synthetic"
    private val verifier = "synthetic-dynamic-client-code-verifier-with-at-least-forty-three-characters"

    @BeforeEach
    fun clearLimits() {
        admin.update("delete from forena.auth_rate_limit")
    }

    @Test
    fun `anonymous discovery and registration provision a protected confidential client without environment configuration`() {
        val sessionsBefore = sessionCount()
        val metadata = request("/.well-known/oauth-authorization-server")
        assertThat(metadata.statusCode()).isEqualTo(200)
        assertThat(json.readTree(metadata.body()).path("registration_endpoint").asString())
            .isEqualTo(settings.origin + "/oauth2/register")
        assertThat(metadata.headers().allValues("set-cookie")).isEmpty()
        assertThat(environment.getProperty("forena.authentication.client-id")).isEmpty()

        val result = registration(mapOf("redirect_uris" to listOf(callback), "client_name" to "Unverified system administrator"))

        assertThat(result.statusCode()).isEqualTo(201)
        assertThat(result.headers().firstValue("Cache-Control").orElseThrow()).contains("no-store")
        assertThat(result.headers().allValues("set-cookie")).isEmpty()
        val registered = json.readTree(result.body())
        assertThat(registered.path("client_id").asString()).isNotBlank()
        assertThat(registered.path("client_name").asString()).isEqualTo("Extern MCP-klient")
        assertThat(registered.path("scope").asString()).isEqualTo("mcp:read")
        assertThat(registered.path("token_endpoint_auth_method").asString()).isEqualTo("client_secret_basic")
        assertThat(registered.path("redirect_uris").toList().map { it.asString() }).containsExactly(callback)
        assertThat(registered.path("grant_types").toList().map { it.asString() }).containsExactly("authorization_code")
        val stored = requireNotNull(clients.findByClientId(registered.path("client_id").asString()))
        assertThat(stored.clientSettings.isRequireProofKey).isTrue()
        assertThat(stored.clientSettings.isRequireAuthorizationConsent).isTrue()
        assertThat(stored.tokenSettings.accessTokenFormat).isEqualTo(OAuth2TokenFormat.REFERENCE)
        assertThat(stored.tokenSettings.accessTokenTimeToLive).isEqualTo(Duration.ofMinutes(15))
        assertThat(stored.tokenSettings.isReuseRefreshTokens).isFalse()
        assertThat(stored.tokenSettings.refreshTokenTimeToLive).isEqualTo(Duration.ofHours(8))
        val secret = registered.path("client_secret").asString()
        assertThat(stored.clientSecret).isNotEqualTo(secret)
        assertThat(passwords.matches(secret, stored.clientSecret)).isTrue()
        assertThat(sessionCount()).isEqualTo(sessionsBefore)
    }

    @Test
    fun `registration preserves callback bytes at the storage boundary including encoded commas`() {
        val first = "https://client.example.invalid/encoded%2Ccallback/".padEnd(499, 'a')
        val second = "https://client.example.invalid/callback/".padEnd(500, 'b')
        val redirects = listOf(first, second)
        assertThat(redirects.joinToString(",")).hasSize(1000)

        val result = registration(mapOf("redirect_uris" to redirects, "token_endpoint_auth_method" to "none"))

        assertThat(result.statusCode()).isEqualTo(201)
        val id = json.readTree(result.body()).path("client_id").asString()
        assertThat(requireNotNull(clients.findByClientId(id)).redirectUris).containsExactlyInAnyOrderElementsOf(redirects)
        assertThat(json.readTree(result.body()).path("redirect_uris").toList().map { it.asString() })
            .containsExactlyInAnyOrderElementsOf(redirects)
    }

    @Test
    fun `an untrusted browser cookie is not consulted or replaced during public registration`() {
        val before = sessionCount()
        val result = request("/oauth2/register", json.writeValueAsString(mapOf(
            "redirect_uris" to listOf(callback), "token_endpoint_auth_method" to "none",
        )), cookie = "${settings.cookieName}=untrusted-cookie")

        assertThat(result.statusCode()).isEqualTo(201)
        assertThat(result.headers().allValues("set-cookie")).isEmpty()
        assertThat(sessionCount()).isEqualTo(before)
    }

    @Test
    fun `a public client requesting refresh metadata completes consent PKCE and scoped MCP without gaining refresh tokens`() {
        val client = registeredClient("none", refresh = true)
        val stored = requireNotNull(clients.findByClientId(client.id))
        assertThat(stored.authorizationGrantTypes.map { it.value }).containsExactly("authorization_code")
        assertThat(stored.clientSecret).isNull()
        val session = userSession()
        val activity = personalActivity(session)

        val code = authorize(client, session)
        val issued = exchange(client, code)

        assertThat(issued.statusCode()).isEqualTo(200)
        val tokens = json.readTree(issued.body())
        assertThat(tokens.hasNonNull("refresh_token")).isFalse()
        assertThat(tokens.path("scope").asString()).isEqualTo("mcp:read")
        val access = tokens.path("access_token").asString()
        assertThat(access).isNotBlank().doesNotContain(".")
        val called = request("/api/mcp", json.writeValueAsString(mapOf(
            "jsonrpc" to "2.0", "id" to 1, "method" to "tools/call",
            "params" to mapOf("name" to "list_my_activities", "arguments" to emptyMap<String, Any>()),
        )), authorization = "Bearer $access")
        assertThat(called.statusCode()).isEqualTo(200)
        val result = json.readTree(called.body()).path("result")
        assertThat(result.path("isError").asBoolean()).isFalse()
        val payload = json.readTree(result.path("content").single().path("text").asString())
        assertThat(payload.path("activities").toList().map { it.path("id").asString() }).containsExactly(activity.toString())
        assertThat(called.headers().allValues("set-cookie")).isEmpty()
    }

    @ParameterizedTest
    @ValueSource(strings = ["client_secret_basic", "client_secret_post"])
    fun `registered confidential authentication supports rotating refresh tokens and revocation`(method: String) {
        val client = registeredClient(method, refresh = true)
        val code = authorize(client, userSession())
        val issued = exchange(client, code)
        assertThat(issued.statusCode()).isEqualTo(200)
        val first = json.readTree(issued.body())
        val oldRefresh = first.path("refresh_token").asString()
        assertThat(oldRefresh).isNotBlank()
        clearLimits()

        val refreshed = token(client, mapOf("grant_type" to "refresh_token", "refresh_token" to oldRefresh))
        assertThat(refreshed.statusCode()).isEqualTo(200)
        val second = json.readTree(refreshed.body())
        assertThat(second.path("refresh_token").asString()).isNotBlank().isNotEqualTo(oldRefresh)
        val access = second.path("access_token").asString()
        assertThat(request("/api/mcp", """{"jsonrpc":"2.0","id":1,"method":"ping"}""", authorization = "Bearer $access").statusCode()).isEqualTo(200)
        assertThat(token(client, mapOf("grant_type" to "refresh_token", "refresh_token" to oldRefresh)).statusCode()).isEqualTo(400)
        clearLimits()

        assertThat(token(client, mapOf("token" to access), "/oauth2/revoke").statusCode()).isEqualTo(200)
        assertThat(request("/api/mcp", """{"jsonrpc":"2.0","id":2,"method":"ping"}""", authorization = "Bearer $access").statusCode()).isEqualTo(401)
    }

    @Test
    fun `registration cannot disable mandatory PKCE or replace user consent`() {
        val client = registeredClient("none")
        val session = userSession()
        val missingProof = request("/oauth2/authorize?" + authorizationQuery(client, UUID.randomUUID().toString(), proof = false), cookie = session)
        assertThat(missingProof.statusCode()).isIn(302, 400)
        if (missingProof.statusCode() == 302) {
            val failure = URI(missingProof.headers().firstValue("Location").orElseThrow())
            assertThat(parameters(failure)["error"]).isEqualTo("invalid_request")
            assertThat(parameters(failure)).doesNotContainKey("code")
        }
        clearLimits()
        val code = authorize(client, session)
        val rejected = exchange(client, code, proof = "a-different-synthetic-code-verifier-with-forty-three-characters")
        assertThat(rejected.statusCode()).isEqualTo(400)
        assertThat(json.readTree(rejected.body()).path("error").asString()).isEqualTo("invalid_grant")
    }

    @ParameterizedTest
    @ValueSource(strings = ["http://127.0.0.1", "http://[::1]", "https://127.0.0.1", "https://[::1]"])
    fun `literal loopback redirects allow the native runtime port exception`(origin: String) {
        val client = registeredClient("none", redirect = "$origin:32100/callback")
        val runtimeRedirect = "$origin:32101/callback"
        val code = authorize(client, userSession(), runtimeRedirect)

        assertThat(exchange(client, code, runtimeRedirect).statusCode()).isEqualTo(200)
    }

    @ParameterizedTest
    @ValueSource(strings = [
        "https://client.example.invalid/other-callback",
        "https://client.example.invalid/callback?installation=other",
    ])
    fun `HTTPS callback path and query must match the registered value`(redirect: String) {
        val client = registeredClient("none")
        val result = request("/oauth2/authorize?" + authorizationQuery(client, UUID.randomUUID().toString(), redirect), cookie = userSession())
        assertThat(result.statusCode()).isEqualTo(400)
        assertThat(result.headers().firstValue("Location")).isEmpty()
    }

    @ParameterizedTest
    @ValueSource(strings = ["http://localhost:32101/callback", "http://127.0.0.1:32100/other", "https://127.0.0.1:32100/callback"])
    fun `literal loopback port exception never broadens its host path or scheme`(redirect: String) {
        val client = registeredClient("none", redirect = "http://127.0.0.1:32100/callback")
        val result = request("/oauth2/authorize?" + authorizationQuery(client, UUID.randomUUID().toString(), redirect), cookie = userSession())
        assertThat(result.statusCode()).isEqualTo(400)
        assertThat(result.headers().firstValue("Location")).isEmpty()
    }

    @Test
    fun `localhost callback ports remain exact rather than using the IP literal exception`() {
        val client = registeredClient("none", redirect = "http://localhost:32100/callback")
        val result = request("/oauth2/authorize?" + authorizationQuery(client, UUID.randomUUID().toString(), "http://localhost:32101/callback"), cookie = userSession())
        assertThat(result.statusCode()).isEqualTo(400)
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("invalidMetadata")
    fun `unsupported client privileges are rejected without storing a client`(name: String, changes: Map<String, Any>, expectedError: String) {
        val before = clientCount()
        val result = registration(mapOf("redirect_uris" to listOf(callback), "token_endpoint_auth_method" to "none") + changes)
        assertThat(result.statusCode()).describedAs(name).isEqualTo(400)
        assertThat(json.readTree(result.body()).path("error").asString()).isEqualTo(expectedError)
        assertThat(clientCount()).isEqualTo(before)
        assertThat(result.headers().allValues("set-cookie")).isEmpty()
    }

    @ParameterizedTest
    @ValueSource(strings = [
        "http://client.example.invalid/callback", "https://user:password@client.example.invalid/callback",
        "https://client.example.invalid/callback#fragment", "https://*.example.invalid/callback", "/relative/callback",
        "javascript:alert(1)", "http://localhost.attacker.invalid/callback",
        "https://client.example.invalid/call,back", "https://client.example.invalid/callback?value=a,b",
        "http://127.0.0.1:99999/callback", "http://127.0.0.1:0/callback", "https://client.example.invalid:0/callback",
    ])
    fun `unsafe callback metadata cannot be registered`(redirect: String) {
        val result = registration(mapOf("redirect_uris" to listOf(redirect), "token_endpoint_auth_method" to "none"))
        assertThat(result.statusCode()).isEqualTo(400)
        assertThat(json.readTree(result.body()).path("error").asString()).isEqualTo("invalid_redirect_uri")
    }

    @ParameterizedTest
    @ValueSource(strings = ["", "{", "[]", "null", "{\"redirect_uris\":1}"])
    fun `malformed registration JSON fails without creating sessions or clients`(body: String) {
        val clientsBefore = clientCount()
        val sessionsBefore = sessionCount()
        val result = request("/oauth2/register", body)
        assertThat(result.statusCode()).isEqualTo(400)
        assertThat(clientCount()).isEqualTo(clientsBefore)
        assertThat(sessionCount()).isEqualTo(sessionsBefore)
        assertThat(result.headers().allValues("set-cookie")).isEmpty()
    }

    @ParameterizedTest
    @ValueSource(booleans = [false, true])
    fun `registration body bound applies with content length and chunked input`(chunked: Boolean) {
        val before = clientCount()
        val result = request("/oauth2/register", """{"redirect_uris":["$callback"],"client_name":"${"x".repeat(16384)}"}""", chunked = chunked)
        assertThat(result.statusCode()).isEqualTo(413)
        assertThat(clientCount()).isEqualTo(before)
        assertThat(result.headers().allValues("set-cookie")).isEmpty()
    }

    @Test
    fun `registration requires JSON and is bounded before cookies or invalid metadata create sessions`() {
        val wrongType = request("/oauth2/register", "redirect_uris=ignored", contentType = "application/x-www-form-urlencoded")
        assertThat(wrongType.statusCode()).isEqualTo(415)
        clearLimits()
        val sessionsBefore = sessionCount()
        val clientsBefore = clientCount()
        val responses = (1..12).map {
            request("/oauth2/register", "{}", cookie = "${settings.cookieName}=untrusted-cookie")
        }
        assertThat(responses.count { it.statusCode() == 400 }).isBetween(1, 5)
        val limited = responses.filter { it.statusCode() == 429 }
        assertThat(limited).isNotEmpty()
        limited.forEach { result ->
            assertThat(result.headers().firstValue("Retry-After").orElseThrow().toLong()).isPositive()
            assertThat(result.headers().allValues("set-cookie")).isEmpty()
        }
        assertThat(responses.map { it.statusCode() }).allMatch { it == 400 || it == 429 }
        assertThat(sessionCount()).isEqualTo(sessionsBefore)
        assertThat(clientCount()).isEqualTo(clientsBefore)
    }

    private data class Client(val id: String, val secret: String?, val method: String, val redirect: String)

    private fun registeredClient(method: String, redirect: String = callback, refresh: Boolean = false): Client {
        val result = registration(mapOf(
            "redirect_uris" to listOf(redirect), "token_endpoint_auth_method" to method,
            "grant_types" to if (refresh) listOf("authorization_code", "refresh_token") else listOf("authorization_code"),
        ))
        assertThat(result.statusCode()).isEqualTo(201)
        val data = json.readTree(result.body())
        return Client(data.path("client_id").asString(), data.get("client_secret")?.asString(), method, redirect)
    }

    private fun registration(metadata: Map<String, Any>) = request("/oauth2/register", json.writeValueAsString(metadata))

    private fun userSession(): String {
        clearLimits()
        val email = "dcr-${UUID.randomUUID()}@example.invalid"
        val password = "synthetic-dynamic-registration-password"
        val registered = request("/api/auth/register", json.writeValueAsString(mapOf("email" to email, "password" to password)), browser = true)
        assertThat(registered.statusCode()).isEqualTo(200)
        val registrationCookie = cookie(registered)
        val outbox = admin.queryForMap("select id,encrypted_link from forena.auth_mail_outbox where recipient=? and kind='verify'", email)
        val link = URI(settings.decrypt(outbox["encrypted_link"].toString(), outbox["id"].toString()))
        val verified = request("/api/auth/email/verify", json.writeValueAsString(mapOf("code" to parameters(link).getValue("code"))), cookie = registrationCookie, browser = true)
        assertThat(verified.statusCode()).isEqualTo(200)
        clearLimits()
        val loggedIn = request("/api/auth/login", form(mapOf("email" to email, "password" to password)), form = true, browser = true)
        assertThat(loggedIn.statusCode()).isEqualTo(200)
        clearLimits()
        return cookie(loggedIn)
    }

    private fun personalActivity(session: String): UUID {
        val subject = json.readTree(request("/api/auth/session", cookie = session, browser = true).body()).path("user").path("id").asString()
        val organization = UUID.randomUUID()
        val team = UUID.randomUUID()
        val person = UUID.randomUUID()
        val activity = UUID.randomUUID()
        admin.update("insert into forena.organization(id,name) values(?,?)", organization, "DCR test club")
        admin.update("insert into forena.person(id,organization_id,display_name) values(?,?,?)", person, organization, "DCR test person")
        admin.update("insert into forena.person_access(person_id,organization_id,subject,kind) values(?,?,?,'self')", person, organization, UUID.fromString(subject))
        admin.update("insert into forena.team(id,organization_id,name) values(?,?,?)", team, organization, "DCR test team")
        admin.update("insert into forena.activity(id,organization_id,team_id,title,starts_at,ends_at) values(?,?,?,? ,now()+interval '1 hour',now()+interval '2 hours')", activity, organization, team, "DCR test activity")
        admin.update("insert into forena.invitation(id,organization_id,activity_id,person_id) values(?,?,?,?)", UUID.randomUUID(), organization, activity, person)
        return activity
    }

    private fun authorizationQuery(client: Client, state: String, redirect: String = client.redirect, proof: Boolean = true): String {
        val values = mutableMapOf(
            "response_type" to "code", "client_id" to client.id, "redirect_uri" to redirect,
            "scope" to "mcp:read", "state" to state, "resource" to resource,
        )
        if (proof) {
            values["code_challenge"] = Base64.getUrlEncoder().withoutPadding().encodeToString(MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray(UTF_8)))
            values["code_challenge_method"] = "S256"
        }
        return form(values)
    }

    private fun authorize(client: Client, session: String, redirect: String = client.redirect): String {
        val state = UUID.randomUUID().toString()
        val started = request("/oauth2/authorize?" + authorizationQuery(client, state, redirect), cookie = session)
        assertThat(started.statusCode()).isEqualTo(302)
        val location = URI(started.headers().firstValue("Location").orElseThrow())
        assertThat(location.path).isEqualTo("/oauth/consent")
        val consent = request("/api/auth/oauth/consent?" + location.rawQuery, cookie = session, browser = true)
        assertThat(consent.statusCode()).isEqualTo(200)
        val data = json.readTree(consent.body())
        assertThat(data.path("clientId").asString()).isEqualTo(client.id)
        assertThat(data.path("scope").asString()).isEqualTo("mcp:read")
        val approved = request("/oauth2/authorize", form(mapOf(
            "client_id" to client.id, "state" to data.path("state").asString(), "scope" to "mcp:read",
            "resource" to resource, "_csrf" to data.path("csrfToken").asString(),
        )), cookie = session, form = true, browser = true)
        assertThat(approved.statusCode()).isEqualTo(302)
        val callback = URI(approved.headers().firstValue("Location").orElseThrow())
        assertThat(callback.scheme + "://" + callback.rawAuthority + callback.rawPath)
            .isEqualTo(URI(redirect).let { it.scheme + "://" + it.rawAuthority + it.rawPath })
        assertThat(parameters(callback)["state"]).isEqualTo(state)
        return parameters(callback).getValue("code")
    }

    private fun exchange(client: Client, code: String, redirect: String = client.redirect, proof: String = verifier): HttpResponse<String> =
        token(client, mapOf("grant_type" to "authorization_code", "code" to code, "redirect_uri" to redirect, "code_verifier" to proof))

    private fun token(client: Client, values: Map<String, String>, path: String = "/oauth2/token"): HttpResponse<String> {
        val fields = values.toMutableMap().also { it["resource"] = resource }
        val authorization = if (client.method == "client_secret_basic") {
            "Basic " + Base64.getEncoder().encodeToString("${client.id}:${client.secret}".toByteArray(UTF_8))
        } else {
            fields["client_id"] = client.id
            if (client.method == "client_secret_post") fields["client_secret"] = requireNotNull(client.secret)
            null
        }
        return request(path, form(fields), authorization = authorization, form = true)
    }

    private fun request(path: String, body: String? = null, cookie: String? = null, authorization: String? = null,
                        form: Boolean = false, browser: Boolean = false, chunked: Boolean = false,
                        contentType: String? = null): HttpResponse<String> {
        val builder = HttpRequest.newBuilder(URI(base + path)).timeout(Duration.ofSeconds(15))
        if (browser) builder.header("Origin", settings.origin).header("X-Forena-Request", "1")
        if (path == "/api/mcp") builder.header("Accept", "application/json, text/event-stream")
        cookie?.let { builder.header("Cookie", it) }
        authorization?.let { builder.header("Authorization", it) }
        if (body == null) builder.GET() else {
            builder.header("Content-Type", contentType ?: if (form) "application/x-www-form-urlencoded" else "application/json")
            val publisher = if (chunked) HttpRequest.BodyPublishers.ofInputStream { ByteArrayInputStream(body.toByteArray(UTF_8)) }
                else HttpRequest.BodyPublishers.ofString(body)
            builder.POST(publisher)
        }
        return http.send(builder.build(), HttpResponse.BodyHandlers.ofString())
    }

    private fun form(values: Map<String, String>): String = values.entries.joinToString("&") {
        URLEncoder.encode(it.key, UTF_8) + "=" + URLEncoder.encode(it.value, UTF_8)
    }

    private fun parameters(uri: URI): Map<String, String> = uri.rawQuery.orEmpty().split('&').filter { it.contains('=') }
        .associate { URLDecoder.decode(it.substringBefore('='), UTF_8) to URLDecoder.decode(it.substringAfter('='), UTF_8) }

    private fun cookie(response: HttpResponse<String>): String = response.headers().allValues("set-cookie")
        .single { it.startsWith(settings.cookieName + "=") }.substringBefore(';')

    private fun clientCount(): Int = requireNotNull(admin.queryForObject("select count(*) from forena.oauth2_registered_client", Int::class.java))
    private fun sessionCount(): Int = requireNotNull(admin.queryForObject("select count(*) from forena.spring_session", Int::class.java))
}
