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
import org.springframework.mail.SimpleMailMessage
import org.springframework.mail.javamail.JavaMailSenderImpl
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.testcontainers.postgresql.PostgreSQLContainer
import org.mockito.Mockito
import se.forena.api.identity.BrowserSessionSettings
import se.forena.api.identity.nativeauth.NativeAuthMailService
import tools.jackson.databind.json.JsonMapper

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class NativeAuthTest {
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
            registry.add("forena.native-auth.mail-from") { "Förena <auth@example.invalid>" }
            registry.add("forena.native-auth.mail-delay-ms") { 3600000 }
            registry.add("forena.native-auth.smtp-host") { "localhost" }
            registry.add("forena.native-auth.client-id") { "native-mcp-test" }
            registry.add("forena.native-auth.client-redirect") { "https://client.example.invalid/callback" }
            registry.add("forena.native-auth.client-secret") { "synthetic-oauth-client-secret-for-native-test" }
        }
    }
    @Autowired lateinit var environment: Environment
    @Autowired lateinit var json: JsonMapper
    @Autowired lateinit var settings: BrowserSessionSettings
    @Autowired lateinit var mail: NativeAuthMailService
    @MockitoBean lateinit var sender: JavaMailSenderImpl
    private val http = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build()
    private val admin by lazy { JdbcTemplate(DriverManagerDataSource(database.jdbcUrl, database.username, database.password)) }
    private val email = "native-${UUID.randomUUID()}@example.invalid"
    private val password = "synthetic-password-for-native-test"
    private val base get() = "http://127.0.0.1:${environment.getRequiredProperty("local.server.port")}"
    @BeforeEach fun clearLimits() { admin.update("delete from forena.auth_rate_limit") }
    private fun request(path: String, body: String? = null, cookie: String? = null, bearer: String? = null,
                        form: Boolean = false, csrf: Boolean = true): HttpResponse<String> {
        val builder = HttpRequest.newBuilder(URI(base + path)).header("Origin", settings.origin)
        if (csrf) builder.header("X-Forena-Request", "1")
        cookie?.let { builder.header("Cookie", it) }; bearer?.let { builder.header("Authorization", "Bearer $it") }
        if (body == null) builder.GET() else builder.header("Content-Type", if (form) "application/x-www-form-urlencoded" else "application/json").POST(HttpRequest.BodyPublishers.ofString(body))
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
        Mockito.verify(sender, Mockito.atLeastOnce()).send(Mockito.any(SimpleMailMessage::class.java))
        assertThat(admin.queryForObject("select encrypted_link from forena.auth_mail_outbox where recipient=?", String::class.java, email)).isEmpty()
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
    @Test fun `native OpenAPI can be exported independently of the Supabase contract`() {
        val cookie = register()
        val spec = request("/v3/api-docs", cookie=cookie)
        assertThat(spec.statusCode()).isEqualTo(200)
        assertThat(spec.body()).contains("/api/auth/register", "/api/auth/password/reset", "__Host-forena-session")
        assertThat(spec.body()).doesNotContain("bearerFormat")
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
