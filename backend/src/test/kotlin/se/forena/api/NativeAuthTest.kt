package se.forena.api

import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.StandardCharsets.UTF_8
import java.nio.file.Files
import java.nio.file.Path
import java.security.MessageDigest
import java.time.Instant
import java.util.Base64
import java.util.UUID
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.core.env.Environment
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import se.forena.api.email.EmailSender
import se.forena.api.email.EmailMessage
import se.forena.api.email.EmailDeliveryResult
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.context.annotation.Primary
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.testcontainers.postgresql.PostgreSQLContainer
import se.forena.api.identity.BrowserSessionSettings
import se.forena.api.identity.nativeauth.NativeAuthMailService
import tools.jackson.databind.json.JsonMapper

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(NativeAuthTest.MailConfiguration::class)
class NativeAuthTest {
    class RecordingEmailSender : EmailSender {
        val messages = mutableListOf<EmailMessage>()
        var result: EmailDeliveryResult = EmailDeliveryResult.Accepted("synthetic-mail-id")
        override fun send(message: EmailMessage): EmailDeliveryResult { messages.add(message); return result }
    }
    @TestConfiguration(proxyBeanMethods = false)
    class MailConfiguration {
        @Bean @Primary fun testEmailSender() = RecordingEmailSender()
    }

    companion object {
        val database = PostgreSQLContainer("postgres:17.6-alpine").withInitScript("init.sql").also { it.start() }
        @JvmStatic @DynamicPropertySource fun properties(registry: DynamicPropertyRegistry) {
            registry.add("spring.datasource.url") { database.jdbcUrl }
            registry.add("spring.datasource.username") { "forena_api_runtime" }
            registry.add("spring.datasource.password") { "local-runtime-only" }
            registry.add("spring.liquibase.user") { "forena_api_owner" }
            registry.add("spring.liquibase.password") { "local-owner-only" }
            registry.add("logging.level.se.forena.api.identity.nativeauth") { "DEBUG" }
            registry.add("forena.auth.mode") { "native" }
            registry.add("forena.web-session.enabled") { true }
            registry.add("forena.web-session.origin") { "https://app.example.invalid" }
            registry.add("forena.web-session.key") { Base64.getEncoder().encodeToString(ByteArray(32) { 9 }) }
            registry.add("forena.email.from") { "Förena <auth@example.invalid>" }
            registry.add("forena.email.resend-api-key") { "synthetic-resend-test-key" }
            registry.add("forena.native-auth.mail-delay-ms") { 3600000 }
            registry.add("forena.native-auth.client-id") { "native-mcp-test" }
            registry.add("forena.native-auth.client-redirect") { "https://client.example.invalid/callback" }
            registry.add("forena.native-auth.client-secret") { "synthetic-oauth-client-secret-for-native-test" }
        }
    }
    @Autowired lateinit var environment: Environment
    @Autowired lateinit var json: JsonMapper
    @Autowired lateinit var settings: BrowserSessionSettings
    @Autowired lateinit var mail: NativeAuthMailService
    @Autowired lateinit var sender: RecordingEmailSender
    private val http = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build()
    private val admin by lazy { JdbcTemplate(DriverManagerDataSource(database.jdbcUrl, database.username, database.password)) }
    private val email = "native-${UUID.randomUUID()}@example.invalid"
    private val password = "synthetic-password-for-native-test"
    private val base get() = "http://127.0.0.1:${environment.getRequiredProperty("local.server.port")}"
    @BeforeEach fun clearLimits() {
        admin.update("delete from forena.auth_rate_limit")
        sender.result = EmailDeliveryResult.Accepted("synthetic-mail-id")
        sender.messages.clear()
    }
    private fun request(path: String, body: String? = null, cookie: String? = null, bearer: String? = null,
                        form: Boolean = false, csrf: Boolean = true): HttpResponse<String> {
        val builder = HttpRequest.newBuilder(URI(base + path)).header("Origin", settings.origin)
        if (csrf) builder.header("X-Forena-Request", "1")
        cookie?.let { builder.header("Cookie", it) }; bearer?.let { builder.header("Authorization", "Bearer $it") }
        val fields = if (body != null && !form && path in listOf("/api/auth/login", "/api/auth/magic-link", "/api/auth/magic-link/verify")) json.readTree(body) else null
        val formFields = when (path) {
            "/api/auth/login" -> fields?.let { mapOf("email" to it.path("email").asString(), "password" to it.path("password").asString()) }
            "/api/auth/magic-link" -> fields?.let { mapOf("username" to it.path("email").asString()) }
            "/api/auth/magic-link/verify" -> fields?.let { mapOf("token" to it.path("code").asString()) }
            else -> null
        }
        val payload = formFields?.entries?.joinToString("&") { URLEncoder.encode(it.key, UTF_8)+"="+URLEncoder.encode(it.value, UTF_8) } ?: body
        if (payload == null) builder.GET() else builder.header("Content-Type", if (form || formFields != null) "application/x-www-form-urlencoded" else "application/json").POST(HttpRequest.BodyPublishers.ofString(payload))
        return http.send(builder.build(), HttpResponse.BodyHandlers.ofString())
    }
    private fun cookie(response: HttpResponse<String>) = response.headers().allValues("set-cookie").single { it.startsWith("__Host-forena-session=") }.substringBefore(';')
    private fun token(kind: String): String {
        val row = admin.queryForList("select id,encrypted_link from forena.auth_mail_outbox where recipient=? and kind=? order by expires_at desc limit 1", email, kind).single()
        return URI(settings.decrypt(row["encrypted_link"].toString(), row["id"].toString())).query.substringAfter('=')
    }
    private fun register(): String {
        val body = """{"email":"$email","password":"$password"}"""
        assertThat(request("/api/auth/register", body, csrf=false).statusCode()).isEqualTo(403)
        val registration = request("/api/auth/register", body)
        assertThat(registration.statusCode()).isEqualTo(200)
        assertThat(registration.body()).isEqualTo("""{"ok":true}""")
        assertThat(request("/api/auth/login", body).statusCode()).isEqualTo(401)
        val code = token("verify")
        clearLimits()
        assertThat(request("/api/auth/email/verify", """{"code":"$code"}""", cookie(registration)).statusCode()).isEqualTo(200)
        val login = request("/api/auth/login", body)
        assertThat(login.statusCode()).isEqualTo(200)
        assertThat(login.body()).doesNotContain("access_token", "refresh_token", "password")
        return cookie(login)
    }
    @Test fun `local signup verification login magic link reset and logout use no external identity provider`() {
        val cookie = register()
        val user = admin.queryForMap("select subject,password_hash from forena.native_user where email=?", email)
        assertThat(user["password_hash"].toString()).startsWith("{bcrypt}").doesNotContain(password)
        assertThat(request("/api/auth/session", cookie=cookie).body()).contains(email)
        assertThat(request("/api/me/overview", cookie=cookie).statusCode()).isEqualTo(200)
        assertThat(request("/api/auth/email/verify", """{"code":"${token("verify")}"}""").statusCode()).isEqualTo(401)
        clearLimits()
        val magic = request("/api/auth/magic-link", """{"email":"$email"}""")
        val magicCookie = cookie(magic)
        val magicCode = token("login")
        assertThat(request("/api/auth/magic-link/verify", """{"code":"$magicCode"}""").statusCode()).isEqualTo(401)
        val loggedIn = request("/api/auth/magic-link/verify", """{"code":"$magicCode"}""", magicCookie)
        assertThat(loggedIn.statusCode()).isEqualTo(200)
        assertThat(cookie(loggedIn)).isNotEqualTo(magicCookie)
        clearLimits()
        assertThat(request("/api/auth/magic-link/verify", """{"code":"$magicCode"}""", magicCookie).statusCode()).isEqualTo(401)
        assertThat(request("/api/auth/password/reset-request", """{"email":"$email"}""").statusCode()).isEqualTo(200)
        val reset = token("reset")
        assertThat(request("/api/auth/password/reset", """{"code":"$reset","password":"new-synthetic-password"}""").statusCode()).isEqualTo(200)
        assertThat(request("/api/auth/session", cookie=cookie).statusCode()).isEqualTo(401)
        assertThat(request("/api/auth/session", cookie=cookie(loggedIn)).statusCode()).isEqualTo(401)
        clearLimits()
        assertThat(request("/api/auth/password/reset", """{"code":"$reset","password":"another-synthetic-password"}""").statusCode()).isEqualTo(401)
        assertThat(request("/api/auth/login", """{"email":"$email","password":"$password"}""").statusCode()).isEqualTo(401)
        val newLogin = request("/api/auth/login", """{"email":"$email","password":"new-synthetic-password"}""")
        assertThat(newLogin.statusCode()).isEqualTo(200)
        assertThat(request("/api/auth/logout", "{}", cookie(newLogin)).statusCode()).isEqualTo(200)
        assertThat(request("/api/auth/session", cookie=cookie(newLogin)).statusCode()).isEqualTo(401)
    }
    @Test fun `cookie-less OAuth authorization requests are bounded before persisted sessions are created`() {
        val challenge = Base64.getUrlEncoder().withoutPadding().encodeToString(ByteArray(32) { 1 })
        val resource = URLEncoder.encode(settings.origin + "/api/mcp", UTF_8)
        val query = "response_type=code&client_id=native-mcp-test&redirect_uri=https%3A%2F%2Fclient.example.invalid%2Fcallback&scope=mcp%3Aread&state=bounded-state&code_challenge=$challenge&code_challenge_method=S256&resource=$resource"
        val before = admin.queryForObject("select count(*) from forena.spring_session", Int::class.java)!!
        val responses = (1..12).map { request("/oauth2/authorize?$query") }
        val accepted = responses.count { it.statusCode() == 302 }
        assertThat(accepted).isBetween(1, 5)
        responses.filter { it.statusCode() != 302 }.forEach {
            assertThat(it.statusCode()).isEqualTo(429)
            assertThat(it.headers().firstValue("Retry-After").orElseThrow().toLong()).isPositive()
            assertThat(it.headers().allValues("set-cookie")).isEmpty()
        }
        val fakeCookie = "__Host-forena-session=untrusted-cookie"
        assertThat(request("/oauth2/authorize?$query", cookie=fakeCookie).statusCode()).isEqualTo(429)
        assertThat(request("/oauth2/authorize", query, form=true).statusCode()).isEqualTo(429)
        val after = admin.queryForObject("select count(*) from forena.spring_session", Int::class.java)!!
        assertThat(after - before).isEqualTo(accepted)
        assertThat(admin.queryForObject("select count(*) from forena.auth_rate_limit", Int::class.java)).isEqualTo(2)
    }

    @Test fun `Spring Authorization Server consent PKCE MCP scopes revocation and account status are enforced`() {
        val cookie = register(); clearLimits()
        val verifier = "synthetic-code-verifier-with-at-least-forty-three-characters"
        val challenge = Base64.getUrlEncoder().withoutPadding().encodeToString(MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray()))
        val resource = URLEncoder.encode(settings.origin + "/api/mcp", UTF_8)
        val query = "response_type=code&client_id=native-mcp-test&redirect_uri=https%3A%2F%2Fclient.example.invalid%2Fcallback&scope=mcp%3Aread&state=synthetic-state&code_challenge=$challenge&code_challenge_method=S256&resource=$resource"
        assertThat(request("/oauth2/authorize?" + query.replace(resource, "https%3A%2F%2Fwrong.example.invalid")).statusCode()).isEqualTo(400)
        val start = request("/oauth2/authorize?$query", cookie=cookie)
        assertThat(start.statusCode()).isEqualTo(302)
        val location = URI(start.headers().firstValue("location").orElseThrow())
        val consent = request("/api/auth/oauth/consent?" + location.rawQuery, cookie=cookie)
        assertThat(consent.statusCode()).isEqualTo(200)
        val data = json.readTree(consent.body())
        val body = "client_id=native-mcp-test&state=${data.get("state").asString()}&scope=mcp%3Aread&resource=$resource&_csrf=${URLEncoder.encode(data.get("csrfToken").asString(), UTF_8)}"
        assertThat(request("/oauth2/authorize", body.substringBefore("&_csrf="), cookie, form=true).statusCode()).isEqualTo(403)
        val approve = request("/oauth2/authorize", body, cookie, form=true)
        assertThat(approve.statusCode()).isEqualTo(302)
        val redirect = URI(approve.headers().firstValue("location").orElseThrow())
        assertThat(redirect.host).isEqualTo("client.example.invalid")
        val code = redirect.rawQuery.substringAfter("code=").substringBefore('&')
        val credentials = Base64.getEncoder().encodeToString("native-mcp-test:synthetic-oauth-client-secret-for-native-test".toByteArray())
        fun tokenRequest(verifierValue: String): HttpResponse<String> {
            val tokenBody = "grant_type=authorization_code&code=$code&redirect_uri=https%3A%2F%2Fclient.example.invalid%2Fcallback&code_verifier=$verifierValue&resource=$resource"
            return http.send(HttpRequest.newBuilder(URI("$base/oauth2/token")).header("Authorization", "Basic $credentials").header("Content-Type", "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString(tokenBody)).build(), HttpResponse.BodyHandlers.ofString())
        }
        val issued = tokenRequest(verifier)
        assertThat(issued.statusCode()).isEqualTo(200)
        val access = json.readTree(issued.body()).get("access_token").asString()
        assertThat(request("/api/mcp", """{"jsonrpc":"2.0","id":1,"method":"tools/list"}""", cookie=cookie).statusCode()).isEqualTo(401)
        assertThat(request("/api/mcp", """{"jsonrpc":"2.0","id":1,"method":"tools/list"}""", bearer=access).body()).contains("list_my_activities")
        assertThat(request("/api/mcp", """{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_my_activities","arguments":{}}}""", bearer=access).statusCode()).isEqualTo(200)
        assertThat(request("/api/me/overview", bearer=access).statusCode()).isEqualTo(400)
        assertThat(tokenRequest(verifier).statusCode()).isEqualTo(400)
        // Local disable applies to both the browser and issued OAuth grants.
        admin.update("update forena.account set enabled=false where subject=(select subject from forena.native_user where email=?)", email)
        assertThat(request("/api/mcp", """{"jsonrpc":"2.0","id":3,"method":"ping"}""", bearer=access).statusCode()).isEqualTo(401)
        assertThat(request("/api/auth/session", cookie=cookie).statusCode()).isEqualTo(401)
    }
    @Test fun `outbox delivers a neutral transactional message without logging or persisting plaintext links`() {
        register(); val row = admin.queryForMap("select encrypted_link from forena.auth_mail_outbox where recipient=?", email)
        assertThat(row["encrypted_link"].toString()).doesNotContain("http", "code=")
        repeat(3) { mail.deliver() }
        assertThat(sender.messages.any { it.to == email }).isTrue()
        assertThat(admin.queryForObject("select encrypted_link from forena.auth_mail_outbox where recipient=?", String::class.java, email)).isEmpty()
    }
    @Test fun `outbox retries preserve message and idempotency key and honor provider delay`() {
        register()
        val queued = admin.queryForMap("select id,encrypted_link from forena.auth_mail_outbox where recipient=?", email)
        val id = queued["id"] as UUID
        sender.result = EmailDeliveryResult.Retry(120)
        mail.deliver()
        val retry = admin.queryForMap("select attempts,encrypted_link,next_attempt > now()+interval '110 seconds' as delayed from forena.auth_mail_outbox where id=?", id)
        assertThat(retry["attempts"]).isEqualTo(1)
        assertThat(retry["delayed"]).isEqualTo(true)
        assertThat(retry["encrypted_link"]).isEqualTo(queued["encrypted_link"])
        // A subsequent worker run must not ignore the provider's retry delay.
        mail.deliver()
        val first = sender.messages.single { it.to == email }
        assertThat(first.idempotencyKey).isEqualTo("native-auth/$id")
        admin.update("update forena.auth_mail_outbox set next_attempt=now() where id=?", id)
        sender.result = EmailDeliveryResult.Accepted("synthetic-mail-id")
        mail.deliver()
        assertThat(sender.messages.filter { it.to == email }).containsExactly(first, first)
        assertThat(admin.queryForObject("select encrypted_link from forena.auth_mail_outbox where id=?", String::class.java, id)).isEmpty()
    }
    @Test fun `outbox stops permanent failures and removes the sensitive link`() {
        register()
        sender.result = EmailDeliveryResult.Rejected
        mail.deliver()
        val row = admin.queryForMap("select attempts,encrypted_link,delivered_at from forena.auth_mail_outbox where recipient=?", email)
        assertThat(row["attempts"]).isEqualTo(5)
        assertThat(row["encrypted_link"]).isEqualTo("")
        assertThat(row["delivered_at"]).isNull()
        mail.deliver()
        assertThat(sender.messages.count { it.to == email }).isEqualTo(1)
    }
    @Test fun `pending registration cannot activate an older password and stale reset links are rejected`() {
        val first = request("/api/auth/register", """{"email":"$email","password":"$password"}""")
        val old = token("verify")
        val second = request("/api/auth/register", """{"email":"$email","password":"replacement-synthetic-password"}""")
        val current = token("verify")
        clearLimits()
        assertThat(request("/api/auth/email/verify", """{"code":"$old"}""", cookie(first)).statusCode()).isEqualTo(401)
        assertThat(request("/api/auth/email/verify", """{"code":"$current"}""", cookie(second)).statusCode()).isEqualTo(200)
        assertThat(request("/api/auth/login", """{"email":"$email","password":"$password"}""").statusCode()).isEqualTo(401)
        clearLimits()
        assertThat(request("/api/auth/login", """{"email":"$email","password":"replacement-synthetic-password"}""").statusCode()).isEqualTo(200)
        request("/api/auth/password/reset-request", """{"email":"$email"}""")
        val resetA = token("reset")
        request("/api/auth/password/reset-request", """{"email":"$email"}""")
        val resetB = token("reset")
        clearLimits()
        assertThat(request("/api/auth/password/reset", """{"code":"$resetB","password":"changed-synthetic-password"}""").statusCode()).isEqualTo(200)
        assertThat(request("/api/auth/password/reset", """{"code":"$resetA","password":"old-link-synthetic-password"}""").statusCode()).isEqualTo(401)
    }
    @Autowired @org.springframework.beans.factory.annotation.Qualifier("nativeWebSecurity")
    lateinit var webSecurity: org.springframework.security.web.SecurityFilterChain
    @Test fun `authentication endpoints use Spring filters and credential deletion enforces ownership`() {
        assertThat(webSecurity.filters.map { it.javaClass.simpleName }).contains(
            "UsernamePasswordAuthenticationFilter", "OneTimeTokenAuthenticationFilter", "GenerateOneTimeTokenFilter",
            "WebAuthnAuthenticationFilter", "WebAuthnRegistrationFilter", "LogoutFilter")
        val session = register()
        val subject = json.readTree(request("/api/auth/session", cookie=session).body()).path("user").path("id").asString()
        val ownUser = Base64.getUrlEncoder().withoutPadding().encodeToString(UUID.randomUUID().toString().toByteArray())
        val foreignUser = Base64.getUrlEncoder().withoutPadding().encodeToString(UUID.randomUUID().toString().toByteArray())
        admin.update("insert into forena.user_entities(id,name,display_name) values(?,?,?),(?,?,?)", ownUser, subject, "Own", foreignUser, UUID.randomUUID().toString(), "Other")
        fun credential(owner: String): String {
            val id = Base64.getUrlEncoder().withoutPadding().encodeToString(UUID.randomUUID().toString().toByteArray())
            admin.update("insert into forena.user_credentials(credential_id,user_entity_user_id,public_key,signature_count,uv_initialized,backup_eligible,backup_state,public_key_credential_type,label,authenticator_transports,created,last_used) values(?,?,?,0,true,false,false,'public-key','Test','internal',now(),now())", id, owner, byteArrayOf(1))
            return id
        }
        val own = credential(ownUser); val foreign = credential(foreignUser)
        fun delete(id: String) = http.send(HttpRequest.newBuilder(URI(base+"/api/auth/passkeys/"+id))
            .header("Origin", settings.origin).header("X-Forena-Request", "1").header("Cookie", session).DELETE().build(), HttpResponse.BodyHandlers.ofString())
        clearLimits()
        assertThat(delete(foreign).statusCode()).isEqualTo(403)
        assertThat(delete(own).statusCode()).isEqualTo(204)
        assertThat(admin.queryForObject("select count(*) from forena.user_credentials where credential_id=?", Int::class.java, foreign)).isEqualTo(1)
        assertThat(admin.queryForObject("select count(*) from forena.user_credentials where credential_id=?", Int::class.java, own)).isZero()
    }
    @Test fun `native OpenAPI can be exported independently of the Supabase contract`() {
        val cookie = register()
        val spec = request("/v3/api-docs", cookie=cookie)
        assertThat(spec.statusCode()).isEqualTo(200)
        assertThat(spec.body()).contains("/api/auth/register", "/api/auth/password/reset", "__Host-forena-session")
        assertThat(spec.body()).doesNotContain("bearerFormat")
        val paths = json.readTree(spec.body()).path("paths")
        for (endpoint in se.forena.api.identity.nativeauth.NativeAuthenticationEndpoints.all) {
            assertThat(paths.has(endpoint.path)).isTrue()
            endpoint.request?.let { assertThat(paths.path(endpoint.path).path("post").path("requestBody").path("content")
                .has(if (endpoint.form) "application/x-www-form-urlencoded" else "application/json")).isTrue() }
        }
        val schemas = json.readTree(spec.body()).path("components").path("schemas")
        assertThat(schemas.path("Bytes").path("type").asString()).isEqualTo("string")
        assertThat(schemas.path("PublicKeyCredentialRequestOptions").path("properties").path("timeout").path("type").asString()).isEqualTo("integer")
        Files.writeString(Path.of("target/native-openapi.json"), spec.body())
    }
    @Test @EnabledIfEnvironmentVariable(named = "FORENA_NATIVE_BROWSER_TEST", matches = "true")
    fun `browser uses the real native backend and cryptographic WebAuthn verification`() {
        val mailbox = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        mailbox.createContext("/") { exchange ->
            val body = if (exchange.requestURI.path == "/reset-limits") { clearLimits(); "{}" }
                else json.writeValueAsString(mapOf("code" to token(exchange.requestURI.query.substringAfter("kind="))))
            val bytes = body.toByteArray(UTF_8)
            exchange.responseHeaders.add("Content-Type", "application/json")
            exchange.sendResponseHeaders(200, bytes.size.toLong()); exchange.responseBody.use { it.write(bytes) }
        }
        mailbox.start()
        try {
            val process = ProcessBuilder("node", "scripts/migration/native-auth-browser.mjs").directory(Path.of("..").toFile())
                .redirectErrorStream(true).redirectOutput(Path.of("target/native-browser.log").toFile())
            process.environment().keys.removeIf { it.startsWith("FORENA_") }
            process.environment().putAll(mapOf("FORENA_NATIVE_API" to base, "FORENA_NATIVE_MAILBOX" to "http://127.0.0.1:${mailbox.address.port}",
                "FORENA_NATIVE_TEST_EMAIL" to email, "FORENA_BROWSER_EXECUTABLE" to "/usr/bin/chromium"))
            val child = process.start()
            if (!child.waitFor(180, java.util.concurrent.TimeUnit.SECONDS)) { child.destroyForcibly(); error("Native browser timed out; see target/native-browser.log") }
            assertThat(child.exitValue()).withFailMessage("See target/native-browser.log").isZero()
        } finally { mailbox.stop(0) }
    }

}
