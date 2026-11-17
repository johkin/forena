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
import java.util.Base64
import java.util.UUID
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit.SECONDS
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.context.annotation.Primary
import org.springframework.core.env.Environment
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.springframework.jdbc.support.JdbcTransactionManager
import org.springframework.security.web.SecurityFilterChain
import org.springframework.session.jdbc.JdbcIndexedSessionRepository
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.transaction.support.TransactionTemplate
import org.testcontainers.postgresql.PostgreSQLContainer
import se.forena.api.email.EmailDeliveryResult
import se.forena.api.email.EmailMessage
import se.forena.api.email.EmailSender
import se.forena.api.identity.BrowserLoginLimiter
import se.forena.api.identity.BrowserSessionSettings
import se.forena.api.identity.authentication.AuthMailService
import se.forena.api.identity.authentication.AuthenticationEndpoints
import tools.jackson.databind.json.JsonMapper

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(AuthTest.MailConfiguration::class)
class AuthTest {
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
            registry.add("logging.level.se.forena.api.identity.authentication") { "DEBUG" }
            registry.add("forena.web-session.enabled") { true }
            registry.add("forena.web-session.origin") { "https://app.example.invalid" }
            registry.add("forena.web-session.key") { Base64.getEncoder().encodeToString(ByteArray(32) { 9 }) }
            registry.add("forena.email.from") { "Förena <auth@example.invalid>" }
            registry.add("forena.email.resend-api-key") { "synthetic-resend-test-key" }
            registry.add("forena.authentication.mail-delay-ms") { 3600000 }
            registry.add("forena.authentication.client-id") { "mcp-test" }
            registry.add("forena.authentication.client-redirect") { "https://client.example.invalid/callback" }
            registry.add("forena.authentication.client-secret") { "synthetic-oauth-client-secret-for-auth-test" }
        }
    }
    @Autowired lateinit var environment: Environment
    @Autowired lateinit var json: JsonMapper
    @Autowired lateinit var settings: BrowserSessionSettings
    @Autowired lateinit var mail: AuthMailService
    @Autowired lateinit var sender: RecordingEmailSender
    private val http = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build()
    private val admin by lazy { JdbcTemplate(DriverManagerDataSource(database.jdbcUrl, database.username, database.password)) }
    private val email = "auth-${UUID.randomUUID()}@example.invalid"
    private val password = "synthetic-password-for-auth-test"
    private val base get() = "http://127.0.0.1:${environment.getRequiredProperty("local.server.port")}"
    @BeforeEach fun clearLimits() {
        admin.update("delete from forena.auth_rate_limit")
        sender.result = EmailDeliveryResult.Accepted("synthetic-mail-id")
        sender.messages.clear()
    }
    private fun request(path: String, body: String? = null, cookie: String? = null, bearer: String? = null,
                        form: Boolean = false, csrf: Boolean = true, origin: String? = settings.origin): HttpResponse<String> {
        val builder = HttpRequest.newBuilder(URI(base + path))
        origin?.let { builder.header("Origin", it) }
        if (path == "/api/mcp") builder.header("Accept", "application/json, text/event-stream")
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
    @Test
    fun `passkey creation uses a readable account name without changing its internal user handle`() {
        val session = register()
        val subject =
            json
                .readTree(request("/api/auth/session", cookie = session).body())
                .path("user")
                .path("id")
                .asText()
        val first = accountRequest("/api/auth/passkey/registration/options", session, "POST", emptyMap<String, String>())
        assertThat(first.statusCode()).isEqualTo(200)
        val options = json.readTree(first.body())
        assertThat(options.path("user").path("name").asText()).isEqualTo(email)
        assertThat(options.path("user").path("displayName").asText()).isEqualTo("Förena · $email")
        assertThat(
                admin.queryForObject(
                    "select name from forena.user_entities where id=?",
                    String::class.java,
                    options.path("user").path("id").asText(),
                )
            )
            .isEqualTo(subject)
        val again = accountRequest("/api/auth/passkey/registration/options", session, "POST", emptyMap<String, String>())
        assertThat(json.readTree(again.body()).path("user").path("id").asText())
            .isEqualTo(options.path("user").path("id").asText())
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
        assertThat(request("/api/me/overview", cookie=cookie).statusCode()).isEqualTo(403)
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
        val query = "response_type=code&client_id=mcp-test&redirect_uri=https%3A%2F%2Fclient.example.invalid%2Fcallback&scope=mcp%3Aread&state=bounded-state&code_challenge=$challenge&code_challenge_method=S256&resource=$resource"
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
        val query = "response_type=code&client_id=mcp-test&redirect_uri=https%3A%2F%2Fclient.example.invalid%2Fcallback&scope=mcp%3Aread&state=synthetic-state&code_challenge=$challenge&code_challenge_method=S256&resource=$resource"
        assertThat(request("/oauth2/authorize?" + query.replace(resource, "https%3A%2F%2Fwrong.example.invalid")).statusCode()).isEqualTo(400)
        val start = request("/oauth2/authorize?$query", cookie=cookie)
        assertThat(start.statusCode()).isEqualTo(302)
        val location = URI(start.headers().firstValue("location").orElseThrow())
        val consent = request("/api/auth/oauth/consent?" + location.rawQuery, cookie=cookie)
        assertThat(consent.statusCode()).isEqualTo(200)
        val data = json.readTree(consent.body())
        val body = "client_id=mcp-test&state=${data.get("state").asString()}&scope=mcp%3Aread&resource=$resource&_csrf=${URLEncoder.encode(data.get("csrfToken").asString(), UTF_8)}"
        assertThat(request("/oauth2/authorize", body.substringBefore("&_csrf="), cookie, form=true).statusCode()).isEqualTo(403)
        val approve = request("/oauth2/authorize", body, cookie, form=true)
        assertThat(approve.statusCode()).isEqualTo(302)
        val redirect = URI(approve.headers().firstValue("location").orElseThrow())
        assertThat(redirect.host).isEqualTo("client.example.invalid")
        val code = redirect.rawQuery.substringAfter("code=").substringBefore('&')
        val credentials = Base64.getEncoder().encodeToString("mcp-test:synthetic-oauth-client-secret-for-auth-test".toByteArray())
        fun tokenRequest(verifierValue: String): HttpResponse<String> {
            val tokenBody = "grant_type=authorization_code&code=$code&redirect_uri=https%3A%2F%2Fclient.example.invalid%2Fcallback&code_verifier=$verifierValue&resource=$resource"
            return http.send(HttpRequest.newBuilder(URI("$base/oauth2/token")).header("Authorization", "Basic $credentials").header("Content-Type", "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString(tokenBody)).build(), HttpResponse.BodyHandlers.ofString())
        }
        val issued = tokenRequest(verifier)
        assertThat(issued.statusCode()).isEqualTo(200)
        val access = json.readTree(issued.body()).get("access_token").asString()
        assertThat(request("/api/mcp", """{"jsonrpc":"2.0","id":1,"method":"tools/list"}""", cookie=cookie).statusCode()).isEqualTo(401)
        val sessionsBeforeMcp = admin.queryForObject("select count(*) from forena.spring_session", Int::class.java)
        val initialize = request("/api/mcp", """{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"forena-auth-test","version":"1.0"}}}""", bearer=access)
        assertThat(initialize.statusCode()).isEqualTo(200)
        val initialized = json.readTree(initialize.body()).path("result")
        assertThat(initialized.path("protocolVersion").asText()).isEqualTo("2025-11-25")
        assertThat(initialized.path("serverInfo").path("name").asText()).isEqualTo("Förena")
        assertThat(initialized.path("capabilities").has("tools")).isTrue()
        assertThat(initialize.headers().firstValue("Mcp-Session-Id")).isEmpty()
        assertThat(initialize.headers().allValues("set-cookie")).isEmpty()
        assertThat(initialize.headers().firstValue("Cache-Control").orElseThrow()).contains("no-store")
        assertThat(request("/api/mcp", """{"jsonrpc":"2.0","method":"notifications/initialized"}""", bearer=access).statusCode()).isEqualTo(202)

        val listed = request("/api/mcp", """{"jsonrpc":"2.0","id":2,"method":"tools/list"}""", bearer=access, origin=null)
        assertThat(listed.statusCode()).isEqualTo(200)
        val tools = json.readTree(listed.body()).path("result").path("tools")
        assertThat(tools.toList().map { it.path("name").asText() }).containsExactlyInAnyOrder(
            "list_my_activities", "list_teams", "get_team_overview", "get_team_member_names", "get_accepted_participant_names",
            "get_team_context", "get_activity_details", "get_activity_invitations", "get_activity_attendance",
            "get_activity_history", "get_assistant_documents", "get_member_assignments", "get_duty_targets", "get_capability_signals",
        )
        tools.forEach { publicTool ->
            assertThat(publicTool.path("annotations").path("readOnlyHint").asBoolean()).isTrue()
            assertThat(publicTool.path("annotations").path("destructiveHint").asBoolean()).isFalse()
            assertThat(publicTool.path("inputSchema").path("additionalProperties").asBoolean()).isFalse()
            assertThat(publicTool.path("inputSchema").path("properties").properties().map { it.key })
                .doesNotContain("context", "actor", "subject", "session", "bearerToken")
        }
        val tool = tools.first { it.path("name").asText() == "list_my_activities" }
        assertThat(tool.path("name").asText()).isEqualTo("list_my_activities")
        assertThat(tool.path("inputSchema").path("type").asText()).isEqualTo("object")
        assertThat(tool.path("inputSchema").path("properties").size()).isZero()
        assertThat(tool.path("inputSchema").path("additionalProperties").asBoolean()).isFalse()
        assertThat(tool.path("annotations").path("readOnlyHint").asBoolean()).isTrue()
        assertThat(tool.path("annotations").path("destructiveHint").asBoolean()).isFalse()

        val preactivation = request("/api/mcp", """{"jsonrpc":"2.0","id":30,"method":"tools/call","params":{"name":"list_my_activities","arguments":{}}}""", bearer=access)
        assertThat(json.readTree(preactivation.body()).path("result").path("isError").asBoolean()).isTrue()
        val approvedOrganization = UUID.randomUUID()
        val approvedSubject = admin.queryForObject("select subject from forena.native_user where email=?", UUID::class.java, email)
        admin.update("insert into forena.organization(id,name) values(?,'Approved OAuth club')", approvedOrganization)
        admin.update("insert into forena.organization_member(organization_id,subject,role) values(?,?,'member')", approvedOrganization, approvedSubject)
        val called = request("/api/mcp", """{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_my_activities","arguments":{}}}""", bearer=access)
        assertThat(called.statusCode()).isEqualTo(200)
        val result = json.readTree(called.body()).path("result")
        assertThat(result.path("isError").asBoolean()).isFalse()
        val content = result.path("content")
        assertThat(content.size()).isEqualTo(1)
        assertThat(content.first().path("type").asText()).isEqualTo("text")
        val activities = json.readTree(content.first().path("text").asText())
        assertThat(activities.path("activities").isArray).isTrue()
        assertThat(activities.path("activities").size()).isZero()
        assertThat(activities.path("limit").asInt()).isEqualTo(50)
        assertThat(activities.path("truncated").asBoolean()).isFalse()
        assertThat(called.headers().firstValue("Cache-Control").orElseThrow()).contains("no-store")
        assertThat(called.headers().allValues("set-cookie")).isEmpty()
        assertThat(admin.queryForObject("select count(*) from forena.spring_session", Int::class.java)).isEqualTo(sessionsBeforeMcp)

        val unknown = request("/api/mcp", """{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"unknown_tool","arguments":{}}}""", bearer=access)
        assertThat(unknown.statusCode()).isEqualTo(200)
        assertThat(json.readTree(unknown.body()).path("error").path("code").asInt()).isEqualTo(-32602)
        val extraArguments = request("/api/mcp", """{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"list_my_activities","arguments":{"subject":"${UUID.randomUUID()}"}}}""", bearer=access)
        assertThat(extraArguments.statusCode()).isEqualTo(200)
        assertThat(json.readTree(extraArguments.body()).path("result").path("isError").asBoolean()).isTrue()
        val missingTeam = request("/api/mcp", """{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"get_team_overview","arguments":{}}}""", bearer=access)
        assertThat(json.readTree(missingTeam.body()).path("result").path("isError").asBoolean()).isTrue()
        val teams = request("/api/mcp", """{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"list_teams","arguments":{}}}""", bearer=access)
        val teamsResult = json.readTree(teams.body()).path("result")
        assertThat(teamsResult.path("isError").asBoolean()).isFalse()
        val teamPage = json.readTree(teamsResult.path("content").first().path("text").asText())
        assertThat(teamPage.path("teams").size()).isZero()
        assertThat(teamPage.path("limit").asInt()).isEqualTo(25)
        assertThat(teamPage.path("nextOffset").isNull).isTrue()
        val deniedDocuments = request("/api/mcp", """{"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"get_assistant_documents","arguments":{"organizationId":"${UUID.randomUUID()}"}}}""", bearer=access)
        val deniedDocumentResult = json.readTree(deniedDocuments.body()).path("result")
        assertThat(deniedDocuments.statusCode()).isEqualTo(200)
        assertThat(deniedDocumentResult.path("isError").asBoolean()).isTrue()
        assertThat(deniedDocumentResult.path("content").first().path("text").asString()).isEqualTo("Uppgifterna kunde inte hämtas.")
        val deniedHistory = request("/api/mcp", """{"jsonrpc":"2.0","id":11,"method":"tools/call","params":{"name":"get_activity_history","arguments":{"teamId":"${UUID.randomUUID()}","from":"2026-10-01","through":"2026-10-31"}}}""", bearer=access)
        val deniedHistoryResult = json.readTree(deniedHistory.body()).path("result")
        assertThat(deniedHistory.statusCode()).isEqualTo(200)
        assertThat(deniedHistoryResult.path("isError").asBoolean()).isTrue()
        assertThat(deniedHistoryResult.path("content").first().path("text").asString()).isEqualTo("Uppgifterna kunde inte hämtas.")
        val deniedOrigin = request("/api/mcp", """{"jsonrpc":"2.0","id":6,"method":"ping"}""", bearer=access, origin="https://foreign.example.invalid")
        assertThat(deniedOrigin.statusCode()).isEqualTo(403)
        assertThat(deniedOrigin.headers().firstValue("Cache-Control").orElseThrow()).contains("no-store")
        val oversized = request("/api/mcp", """{"jsonrpc":"2.0","id":7,"method":"ping","padding":"${"x".repeat(65536)}"}""", bearer=access)
        assertThat(oversized.statusCode()).isEqualTo(413)
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
    @Autowired @Qualifier("webSecurity")
    lateinit var webSecurity: SecurityFilterChain
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
            .header("Origin", settings.origin).header("X-Forena-Request", "1").header("X-Forena-Account", subject).header("Cookie", session).DELETE().build(), HttpResponse.BodyHandlers.ofString())
        clearLimits()
        assertThat(delete(foreign).statusCode()).isEqualTo(403)
        assertThat(delete(own).statusCode()).isEqualTo(204)
        assertThat(admin.queryForObject("select count(*) from forena.user_credentials where credential_id=?", Int::class.java, foreign)).isEqualTo(1)
        assertThat(admin.queryForObject("select count(*) from forena.user_credentials where credential_id=?", Int::class.java, own)).isZero()
    }
    @Autowired lateinit var sessions: JdbcIndexedSessionRepository

    @Test fun `database session IDs cannot be replayed and absolute lifetime is enforced`() {
        val cookie = register()
        val subject = json.readTree(request("/api/auth/session", cookie=cookie).body()).path("user").path("id").asString()
        val id = admin.queryForObject("select session_id from forena.spring_session where principal_name=?", String::class.java, subject)!!
        assertThat(cookie.substringAfter('=')).isNotEqualTo(id)
        assertThat(request("/api/auth/session", cookie="${settings.cookieName}=$id").statusCode()).isEqualTo(401)
        admin.update("update forena.spring_session set creation_time=? where session_id=?", System.currentTimeMillis() - 86401000, id)
        assertThat(request("/api/auth/session", cookie=cookie).statusCode()).isEqualTo(401)
    }

    @Test fun `concurrent instances share admission budget and logout remains available`() {
        val second = BrowserLoginLimiter(admin,
            TransactionTemplate(JdbcTransactionManager(admin.dataSource!!)), settings, false)
        val calls = (1..25).map { index -> CompletableFuture.supplyAsync {
            runCatching { second.admit("synthetic-client-$index") }.isSuccess
        } }
        assertThat(calls.count { it.join() }).isEqualTo(10)
        assertThat(request("/api/auth/logout", "", form=true).statusCode()).isEqualTo(200)
    }

    @Test fun `Swagger UI and OpenAPI are public under the API proxy path while business APIs stay protected`() {
        val entry = request("/api/swagger-ui.html")
        assertThat(entry.statusCode()).isEqualTo(302)
        assertThat(entry.headers().firstValue("Location").orElseThrow()).isEqualTo("/api/swagger-ui/index.html")
        val resources = listOf("/api/swagger-ui/index.html", "/api/swagger-ui/swagger-ui.css",
            "/api/swagger-ui/swagger-ui-bundle.js", "/api/swagger-ui/swagger-ui-standalone-preset.js",
            "/api/swagger-ui/swagger-initializer.js", "/api/v3/api-docs", "/api/v3/api-docs.yaml",
            "/api/v3/api-docs/swagger-config")
        for (path in resources) {
            assertThat(request(path).statusCode()).describedAs(path).isEqualTo(200)
        }
        val config = json.readTree(request("/api/v3/api-docs/swagger-config").body())
        assertThat(config.path("url").asString()).isEqualTo("/api/v3/api-docs")
        assertThat(config.path("configUrl").asString()).isEqualTo("/api/v3/api-docs/swagger-config")
        assertThat(config.path("validatorUrl").asString()).isEmpty()
        val initializer = request("/api/swagger-ui/swagger-initializer.js").body()
        assertThat(initializer).contains("/api/v3/api-docs/swagger-config").doesNotContain("petstore.swagger.io")
        assertThat(request("/api/auth/session").statusCode()).isEqualTo(401)
        assertThat(request("/api/activities").statusCode()).isEqualTo(401)
        assertThat(request("/v3/api-docs", cookie=register()).statusCode()).isEqualTo(404)
    }

    @Test fun `OpenAPI exports the sole authentication contract`() {
        val cookie = register()
        val spec = request("/api/v3/api-docs", cookie=cookie)
        assertThat(spec.statusCode()).isEqualTo(200)
        assertThat(spec.body()).contains("/api/auth/register", "/api/auth/password/reset", "__Host-forena-session")
        assertThat(spec.body()).doesNotContain("bearerFormat")
        val paths = json.readTree(spec.body()).path("paths")
        for (endpoint in AuthenticationEndpoints.all) {
            assertThat(paths.has(endpoint.path)).isTrue()
            endpoint.request?.let { assertThat(paths.path(endpoint.path).path("post").path("requestBody").path("content")
                .has(if (endpoint.form) "application/x-www-form-urlencoded" else "application/json")).isTrue() }
        }
        val schemas = json.readTree(spec.body()).path("components").path("schemas")
        assertThat(schemas.path("Bytes").path("type").asString()).isEqualTo("string")
        assertThat(schemas.path("PublicKeyCredentialRequestOptions").path("properties").path("timeout").path("type").asString()).isEqualTo("integer")
        Files.writeString(Path.of("target/openapi.json"), spec.body())
    }
    @Test @EnabledIfEnvironmentVariable(named = "FORENA_AUTH_BROWSER_TEST", matches = "true")
    fun `browser uses the real Spring backend and cryptographic WebAuthn verification`() {
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
            val process = ProcessBuilder("node", "scripts/migration/auth-browser.mjs").directory(Path.of("..").toFile())
                .redirectErrorStream(true).redirectOutput(Path.of("target/auth-browser.log").toFile())
            process.environment().keys.removeIf { it.startsWith("FORENA_") }
            process.environment().putAll(mapOf("FORENA_AUTH_API" to base, "FORENA_AUTH_MAILBOX" to "http://127.0.0.1:${mailbox.address.port}",
                "FORENA_AUTH_TEST_EMAIL" to email, "FORENA_BROWSER_EXECUTABLE" to (System.getenv("FORENA_BROWSER_EXECUTABLE") ?: "")))
            val child = process.start()
            if (!child.waitFor(180, SECONDS)) { child.destroyForcibly(); error("Auth browser timed out; see target/auth-browser.log") }
            assertThat(child.exitValue()).withFailMessage("See target/auth-browser.log").isZero()
        } finally { mailbox.stop(0) }
    }

    private fun accountRequest(path: String, cookie: String, method: String = "GET", body: Any? = null,
                               expected: String? = null): HttpResponse<String> {
        val subject = expected ?: json.readTree(request("/api/auth/session", cookie = cookie).body()).path("user").path("id").asString()
        val builder = HttpRequest.newBuilder(URI(base + path)).header("Origin", settings.origin)
            .header("X-Forena-Request", "1").header("X-Forena-Account", subject).header("Cookie", cookie)
        val publisher = if (body == null) HttpRequest.BodyPublishers.noBody() else {
            builder.header("Content-Type", "application/json")
            HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))
        }
        return http.send(builder.method(method, publisher).build(), HttpResponse.BodyHandlers.ofString())
    }
    private data class ProfileFixture(val cookie: String, val subject: UUID, val organizations: List<UUID>,
                                      val teams: List<UUID>, val own: List<UUID>, val children: List<UUID>)
    private fun profileFixture(): ProfileFixture {
        val cookie = register()
        val subject = UUID.fromString(json.readTree(request("/api/auth/session", cookie = cookie).body()).path("user").path("id").asString())
        val organizations = List(2) { UUID.randomUUID() }
        val teams = List(2) { UUID.randomUUID() }
        val own = List(2) { UUID.randomUUID() }
        val children = List(2) { UUID.randomUUID() }
        organizations.indices.forEach { index ->
            val org = organizations[index]
            admin.update("insert into forena.organization(id,name) values(?,?)", org, "Profile club $index")
            admin.update("insert into forena.team(id,organization_id,name) values(?,?,?)", teams[index], org, "Profile team $index")
            admin.update("insert into forena.person(id,organization_id,display_name,birth_date) values(?,?,?,date '1980-01-01'),(?,?,?,date '2015-01-01')", own[index], org, "Parent", children[index], org, "Child")
            admin.update("insert into forena.person_access(person_id,organization_id,subject,kind) values(?,?,?,'self'),(?,?,?,'guardian')", own[index], org, subject, children[index], org, subject)
            listOf(own[index], children[index]).forEach { person -> admin.update("insert into forena.team_membership(organization_id,team_id,person_id,role,starts_on) values(?,?,?,'player',current_date-1)", org, teams[index], person) }
        }
        return ProfileFixture(cookie, subject, organizations, teams, own, children)
    }
    private fun ownCommand(fixture: ProfileFixture, name: String = "Changed parent") = mapOf(
        "name" to name, "phone" to "+46701234567", "revision" to 0,
        "people" to fixture.own.associate { it.toString() to 0 })
    private fun childCommand(ids: List<UUID>, name: String = "Changed child", revision: Long = 0) = mapOf(
        "name" to name, "phone" to "0700000000", "birthDate" to "2015-01-01", "contactEmail" to "child-contact@example.invalid",
        "address" to "Example street", "people" to ids.associate { it.toString() to revision })

    @Test fun `profile saves all own club records atomically and keeps children unchanged`() {
        val fixture = profileFixture()
        val initial = accountRequest("/api/me/account", fixture.cookie)
        assertThat(initial.statusCode()).isEqualTo(200)
        assertThat(json.readTree(initial.body()).path("clubs").size()).isEqualTo(2)
        assertThat(accountRequest("/api/me/account", fixture.cookie, "PUT", ownCommand(fixture)).statusCode()).isEqualTo(200)
        fixture.own.forEach { assertThat(admin.queryForObject("select display_name from forena.person where id=?", String::class.java, it)).isEqualTo("Changed parent") }
        fixture.children.forEach { assertThat(admin.queryForObject("select display_name from forena.person where id=?", String::class.java, it)).isEqualTo("Child") }
        assertThat(accountRequest("/api/me/account", fixture.cookie, "PUT", ownCommand(fixture, "Stale overwrite")).statusCode()).isEqualTo(409)
        assertThat(accountRequest("/api/me/account", fixture.cookie, "PUT", ownCommand(fixture), UUID.randomUUID().toString()).statusCode()).isEqualTo(401)
    }
    @Test fun `a failed club update rolls back the entire profile transaction`() {
        val fixture = profileFixture()
        admin.execute("alter table forena.person add constraint profile_atomic_test check(id<>'${fixture.own[1]}'::uuid or display_name<>'Rejected parent')")
        try {
            assertThat(accountRequest("/api/me/account", fixture.cookie, "PUT", ownCommand(fixture, "Rejected parent")).statusCode()).isEqualTo(409)
            fixture.own.forEach { assertThat(admin.queryForObject("select display_name from forena.person where id=?", String::class.java, it)).isEqualTo("Parent") }
            assertThat(admin.queryForObject("select profile_revision from forena.account where subject=?", Long::class.java, fixture.subject)).isZero()
        } finally { admin.execute("alter table forena.person drop constraint profile_atomic_test") }
    }
    @Test fun `child synchronization is explicit versioned and can be broken without deleting relationships`() {
        val fixture = profileFixture()
        assertThat(accountRequest("/api/me/account/children/${fixture.children[0]}", fixture.cookie, "PUT", childCommand(fixture.children)).statusCode()).isEqualTo(409)
        assertThat(accountRequest("/api/me/account/child-links", fixture.cookie, "POST", mapOf("people" to fixture.children)).statusCode()).isEqualTo(200)
        assertThat(accountRequest("/api/me/account/children/${fixture.children[0]}", fixture.cookie, "PUT", childCommand(fixture.children)).statusCode()).isEqualTo(200)
        fixture.children.forEach { assertThat(admin.queryForObject("select display_name from forena.person where id=?", String::class.java, it)).isEqualTo("Changed child") }
        assertThat(accountRequest("/api/me/account/children/${fixture.children[0]}", fixture.cookie, "PUT", childCommand(fixture.children, "Stale child")).statusCode()).isEqualTo(409)
        val history = accountRequest("/api/me/account/children/${fixture.children[0]}/history", fixture.cookie)
        assertThat(history.statusCode()).isEqualTo(200)
        assertThat(history.body()).contains("Namn", "Changed child")
        val group = admin.queryForObject("select group_id from forena.account_child_link where subject=? limit 1", UUID::class.java, fixture.subject)
        assertThat(accountRequest("/api/me/account/child-links/$group", fixture.cookie, "DELETE").statusCode()).isEqualTo(200)
        assertThat(accountRequest("/api/me/account/children/${fixture.children[0]}", fixture.cookie, "PUT", childCommand(listOf(fixture.children[0]), "Only first child", 1)).statusCode()).isEqualTo(200)
        assertThat(admin.queryForObject("select display_name from forena.person where id=?", String::class.java, fixture.children[1])).isEqualTo("Changed child")
        assertThat(admin.queryForObject("select count(*) from forena.person_access where subject=? and active", Int::class.java, fixture.subject)).isEqualTo(4)
    }
    @Test fun `eighteenth birthday removes guardian read and write access including an already opened form`() {
        val fixture = profileFixture()
        val child = fixture.children[0]
        admin.update("update forena.person set birth_date=current_date-interval '18 years' where id=?", child)
        assertThat(accountRequest("/api/me/account/children/$child", fixture.cookie, "PUT", childCommand(listOf(child))).statusCode()).isEqualTo(403)
        assertThat(accountRequest("/api/me/account/children/$child/history", fixture.cookie).statusCode()).isEqualTo(403)
        val response = accountRequest("/api/me/account", fixture.cookie)
        assertThat(response.statusCode()).isEqualTo(200)
        val person = json.readTree(response.body()).path("people").first { it.path("id").asString() == child.toString() }
        assertThat(person.path("editable").asBoolean()).isFalse()
        assertThat(person.path("birthDate").isNull).isTrue()
        assertThat(accountRequest("/api/me/account/children/$child/proposals", fixture.cookie, "POST", mapOf("operation" to "birth-date-correction", "email" to email)).statusCode()).isEqualTo(200)
        assertThat(admin.queryForObject("select birth_date<=current_date-interval '18 years' from forena.person where id=?", Boolean::class.java, child)).isTrue()
        admin.update("update forena.person_access set active=false where person_id=? and subject=?", fixture.own[0], fixture.subject)
        val sessionId = admin.queryForObject("select session_id from forena.spring_session where principal_name=?", String::class.java, fixture.subject.toString())
        val actor = se.forena.api.identity.Actor(fixture.subject, UUID.fromString(sessionId), "")
        assertThat(assistantIdentity.organizations(actor).map { it.id }).doesNotContain(fixture.organizations[0])
        assertThat(assistantIdentity.viewer(actor, fixture.organizations[0], null).roleAssignments)
            .noneMatch { it.source == se.forena.api.identity.AssistantRoleSource.GUARDIAN_RELATION }

    }
    @Test fun `email change is account bound replaceable single use and revokes other sessions`() {
        val fixture = profileFixture()
        val other = cookie(request("/api/auth/login", """{"email":"$email","password":"$password"}"""))
        val nextEmail = "new-${UUID.randomUUID()}@example.invalid"
        assertThat(accountRequest("/api/me/account/email", fixture.cookie, "POST", mapOf("email" to nextEmail)).statusCode()).isEqualTo(200)
        fun changeCode(): String {
            val row = admin.queryForMap("select id,encrypted_link from forena.auth_mail_outbox where recipient=? and kind='email-change' order by expires_at desc limit 1", nextEmail)
            return URI(settings.decrypt(row["encrypted_link"].toString(), row["id"].toString())).query.substringAfter('=')
        }
        val replaced = changeCode()
        assertThat(accountRequest("/api/me/account/email", fixture.cookie, "POST", mapOf("email" to nextEmail)).statusCode()).isEqualTo(200)
        val code = changeCode()
        clearLimits()
        assertThat(accountRequest("/api/me/account/email/confirm", fixture.cookie, "POST", mapOf("code" to replaced)).statusCode()).isEqualTo(403)
        assertThat(accountRequest("/api/me/account/email/confirm", other, "POST", mapOf("code" to code)).statusCode()).isEqualTo(403)
        assertThat(accountRequest("/api/me/account/email/confirm", fixture.cookie, "POST", mapOf("code" to code)).statusCode()).isEqualTo(200)
        assertThat(request("/api/auth/session", cookie = other).statusCode()).isEqualTo(401)
        assertThat(request("/api/auth/session", cookie = fixture.cookie).body()).contains(nextEmail)
        assertThat(accountRequest("/api/me/account/email/confirm", fixture.cookie, "POST", mapOf("code" to code)).statusCode()).isEqualTo(403)
        assertThat(admin.queryForObject("select count(*) from forena.auth_mail_outbox where recipient=? and kind='email-changed'", Int::class.java, email)).isEqualTo(1)
    }
    @Test fun `session revocation needs no recent authentication while password changes do`() {
        val fixture = profileFixture()
        val other = cookie(request("/api/auth/login", """{"email":"$email","password":"$password"}"""))
        val currentId = admin.queryForObject("select session_id from forena.spring_session where principal_name=? order by creation_time limit 1", String::class.java, fixture.subject.toString())
        @Suppress("UNCHECKED_CAST")
        val sessionRepository = sessions as org.springframework.session.SessionRepository<org.springframework.session.Session>
        val current = requireNotNull(sessionRepository.findById(requireNotNull(currentId)))
        current.removeAttribute("forena.recent-authentication"); sessionRepository.save(current)
        assertThat(accountRequest("/api/me/account/password", fixture.cookie, "PUT", mapOf("password" to "updated-synthetic-password")).statusCode()).isEqualTo(403)
        val listed = accountRequest("/api/me/account/sessions", fixture.cookie)
        assertThat(listed.statusCode()).isEqualTo(200)
        assertThat(listed.body()).contains("device", "lastActiveAt", "current")
        assertThat(accountRequest("/api/me/account/sessions", fixture.cookie, "DELETE").statusCode()).isEqualTo(200)
        assertThat(request("/api/auth/session", cookie = other).statusCode()).isEqualTo(401)
        assertThat(accountRequest("/api/me/account/reauthenticate", fixture.cookie, "POST", mapOf("password" to password)).statusCode()).isEqualTo(200)
        assertThat(accountRequest("/api/me/account/password", fixture.cookie, "PUT", mapOf("password" to "updated-synthetic-password")).statusCode()).isEqualTo(200)
        assertThat(request("/api/auth/session", cookie = fixture.cookie).statusCode()).isEqualTo(200)
    }
    @Autowired lateinit var assistantIdentity: se.forena.api.identity.AssistantIdentityService
    @Autowired lateinit var lifecycle: se.forena.api.identity.AccountLifecycleService
    @Test fun `last connection starts thirty days and deletion preserves club people and history`() {
        val fixture = profileFixture()
        lifecycle.connectionsChanged(fixture.subject)
        admin.update("update forena.person_access set active=false where subject=?", fixture.subject)
        lifecycle.connectionsChanged(fixture.subject)
        val view = accountRequest("/api/me/account", fixture.cookie)
        assertThat(view.statusCode()).isEqualTo(200)
        val at = java.time.Instant.parse(json.readTree(view.body()).path("deletionAt").asString())
        val disconnected = admin.queryForObject("select disconnected_at from forena.account_lifecycle where subject=?", java.sql.Timestamp::class.java, fixture.subject)
        assertThat(at).isEqualTo(requireNotNull(disconnected).toInstant().plus(java.time.Duration.ofDays(30)))
        assertThat(request("/api/me/overview", cookie = fixture.cookie).statusCode()).isEqualTo(403)
        admin.update("update forena.account_lifecycle set disconnected_at=clock_timestamp()-interval '30 days' where subject=?", fixture.subject)
        // Discover expiry through the HTTP read, before any maintenance sweep.
        assertThat(accountRequest("/api/me/account", fixture.cookie).statusCode()).isEqualTo(401)
        assertThat(request("/api/auth/session", cookie = fixture.cookie).statusCode()).isEqualTo(401)
        assertThat(admin.queryForObject("select count(*) from forena.native_user where subject=?", Int::class.java, fixture.subject)).isZero()
        fixture.own.forEach { assertThat(admin.queryForObject("select count(*) from forena.person where id=?", Int::class.java, it)).isEqualTo(1) }
    }

    private fun additionalAccount(): Pair<UUID, String> {
        val subject = UUID.randomUUID()
        val address = "additional-$subject@example.invalid"
        admin.update("insert into forena.account(subject,display_name) values(?,'Additional account')", subject)
        admin.update("insert into forena.native_user(subject,email,password_hash,verified) select ?,?,password_hash,true from forena.native_user where email=?", subject, address, email)
        return subject to address
    }
    @Test fun `adult approves follower access per club without exposing personal invitations or attendance`() {
        val fixture = profileFixture()
        val (adult, address) = additionalAccount()
        fixture.children.forEach { admin.update("update forena.person set birth_date=date '2000-01-01' where id=?", it) }
        admin.update("insert into forena.person_access(person_id,organization_id,subject,kind) values(?,?,?,'self')", fixture.children[0], fixture.organizations[0], adult)
        val adultCookie = cookie(request("/api/auth/login", """{"email":"$address","password":"$password"}"""))
        fixture.children.forEach { assertThat(accountRequest("/api/me/account/children/$it/follower", fixture.cookie, "POST").statusCode()).isEqualTo(200) }
        val follower = admin.queryForObject("select id from forena.account_follower where subject=? and person_id=?", UUID::class.java, fixture.subject, fixture.children[0])
        val otherClub = admin.queryForObject("select id from forena.account_follower where subject=? and person_id=?", UUID::class.java, fixture.subject, fixture.children[1])
        assertThat(accountRequest("/api/me/account/followers/$follower", fixture.cookie, "PUT", mapOf("state" to "approved")).statusCode()).isEqualTo(403)
        assertThat(accountRequest("/api/me/account/followers/$follower", adultCookie, "PUT", mapOf("state" to "approved")).statusCode()).isEqualTo(200)
        val activity = UUID.randomUUID()
        admin.update("""insert into forena.activity(id,organization_id,team_id,title,starts_at,ends_at,invitation_send_at,activity_type_id)
            values(?,?,?,'Public match',now()+interval '1 day',now()+interval '2 days',now()-interval '1 day','00000000-0000-4000-8000-000000000002')""", activity, fixture.organizations[0], fixture.teams[0])
        admin.update("""insert into forena.invitation(id,organization_id,activity_id,person_id,response,response_comment,responded_at)
            values(?,?,?,?,'accepted','PRIVATE RESPONSE',now())""", UUID.randomUUID(), fixture.organizations[0], activity, fixture.children[0])
        val matches = accountRequest("/api/me/account/followers/$follower/matches", fixture.cookie)
        assertThat(matches.statusCode()).isEqualTo(200)
        assertThat(matches.body()).contains("Public match").doesNotContain("PRIVATE RESPONSE", "personId", "response", "attendance")
        assertThat(accountRequest("/api/me/account/followers/$otherClub/matches", fixture.cookie).statusCode()).isEqualTo(403)
        assertThat(accountRequest("/api/me/account/children/${fixture.children[0]}/history", fixture.cookie).statusCode()).isEqualTo(403)
        assertThat(accountRequest("/api/me/account/followers/$follower", adultCookie, "PUT", mapOf("state" to "revoked")).statusCode()).isEqualTo(200)
        assertThat(accountRequest("/api/me/account/followers/$follower/matches", fixture.cookie).statusCode()).isEqualTo(403)
    }
    @Test fun `guardian proposal changes no access until club approval and stays within the team mandate`() {
        val fixture = profileFixture()
        val (guardian, address) = additionalAccount()
        val child = fixture.children[0]
        assertThat(accountRequest("/api/me/account/children/$child/proposals", fixture.cookie, "POST", mapOf("email" to address, "operation" to "add")).statusCode()).isEqualTo(200)
        assertThat(admin.queryForObject("select count(*) from forena.person_access where subject=?", Int::class.java, guardian)).isZero()
        val proposal = admin.queryForObject("select id from forena.account_guardian_proposal where person_id=?", UUID::class.java, child)
        val path = "/api/teams/${fixture.teams[0]}/account-administration/proposals/$proposal"
        assertThat(accountRequest(path, fixture.cookie, "PUT", mapOf("approve" to true)).statusCode()).isEqualTo(403)
        admin.update("insert into forena.organization_member(organization_id,subject,role) values(?,?,'admin')", fixture.organizations[0], fixture.subject)
        assertThat(accountRequest(path, fixture.cookie, "PUT", mapOf("approve" to true)).statusCode()).isEqualTo(200)
        assertThat(admin.queryForObject("select count(*) from forena.person_access where subject=? and person_id=? and active", Int::class.java, guardian, child)).isEqualTo(1)
        assertThat(accountRequest("/api/teams/${fixture.teams[0]}/account-administration/people/${fixture.children[1]}/history", fixture.cookie).statusCode()).isEqualTo(400)
        assertThat(accountRequest("/api/teams/${fixture.teams[0]}/account-administration/people/$child/birth-date", fixture.cookie, "PUT", mapOf("birthDate" to "2000-01-01", "revision" to 0)).statusCode()).isEqualTo(200)
        assertThat(accountRequest("/api/me/account/children/$child", fixture.cookie, "PUT", childCommand(listOf(child))).statusCode()).isEqualTo(403)
    }

    @Test fun `club correction rejects future dates without changing age based access`() {
        val fixture = profileFixture()
        val child = fixture.children[0]
        admin.update("insert into forena.organization_member(organization_id,subject,role) values(?,?,'admin')", fixture.organizations[0], fixture.subject)
        admin.update("update forena.organization set time_zone='Pacific/Honolulu' where id=?", fixture.organizations[0])
        val tomorrow = java.time.LocalDate.now(java.time.ZoneId.of("Pacific/Honolulu")).plusDays(1)
        val response = accountRequest("/api/teams/${fixture.teams[0]}/account-administration/people/$child/birth-date", fixture.cookie,
            "PUT", mapOf("birthDate" to tomorrow.toString(), "revision" to 0))
        assertThat(response.statusCode()).isEqualTo(400)
        assertThat(admin.queryForObject("select birth_date::text from forena.person where id=?", String::class.java, child)).isEqualTo("2015-01-01")
        assertThat(admin.queryForObject("select count(*) from forena.person_profile_history where person_id=?", Int::class.java, child)).isZero()
    }

    @Test fun `proposal deduplication quotas and paging bound account responses`() {
        val fixture = profileFixture()
        val child = fixture.children[0]
        val proposalPath = "/api/me/account/children/$child/proposals"
        val body = mapOf("operation" to "add", "email" to "proposed@example.invalid")
        repeat(2) { assertThat(accountRequest(proposalPath, fixture.cookie, "POST", body).statusCode()).isEqualTo(200) }
        assertThat(admin.queryForObject("select count(*) from forena.account_guardian_proposal where person_id=?", Int::class.java, child)).isEqualTo(1)
        admin.update("""insert into forena.person_profile_history(id,person_id,organization_id,actor_subject,changes)
            select gen_random_uuid(),?,?,?,'Change ' || n from generate_series(1,101) n""", child, fixture.organizations[0], fixture.subject)
        val historyPath = "/api/me/account/children/$child/history"
        val first = json.readTree(accountRequest(historyPath, fixture.cookie).body())
        val second = json.readTree(accountRequest("$historyPath?offset=100", fixture.cookie).body())
        assertThat(first.size()).isEqualTo(100)
        assertThat(second.size()).isEqualTo(1)
        assertThat(first.map { it.path("id").asString() }).doesNotContain(second[0].path("id").asString())
        assertThat(accountRequest("$historyPath?offset=-1", fixture.cookie).statusCode()).isEqualTo(400)
        admin.update("""insert into forena.account_guardian_proposal(id,proposer,person_id,organization_id,guardian_email,operation)
            select gen_random_uuid(),?,?,?,'proposal-' || n || '@example.invalid','add' from generate_series(1,101) n""", fixture.subject, child, fixture.organizations[0])
        assertThat(accountRequest(proposalPath, fixture.cookie, "POST", body + ("email" to "new@example.invalid")).statusCode()).isEqualTo(429)
        admin.update("insert into forena.organization_member(organization_id,subject,role) values(?,?,'admin')", fixture.organizations[0], fixture.subject)
        val clubPath = "/api/teams/${fixture.teams[0]}/account-administration"
        assertThat(json.readTree(accountRequest(clubPath, fixture.cookie).body()).path("proposals").size()).isEqualTo(100)
        assertThat(json.readTree(accountRequest("$clubPath?offset=100", fixture.cookie).body()).path("proposals").size()).isEqualTo(2)
        assertThat(json.readTree(accountRequest("$clubPath/people/$child/history?offset=100", fixture.cookie).body()).size()).isEqualTo(1)
    }

    @Test fun `profile mutation admission limits repeated proposal writes`() {
        val fixture = profileFixture()
        val path = "/api/me/account/children/${fixture.children[0]}/proposals"
        val responses = (1..15).map {
            accountRequest(path, fixture.cookie, "POST", mapOf("operation" to "add", "email" to "limited@example.invalid")).statusCode()
        }
        assertThat(responses).contains(200, 429)
        assertThat(admin.queryForObject("select count(*) from forena.account_guardian_proposal where proposer=?", Int::class.java, fixture.subject)).isEqualTo(1)
    }

    @Test fun `explicitly revoked guardian cannot request follower access or queue mail`() {
        val fixture = profileFixture()
        val child = fixture.children[0]
        admin.update("update forena.person set birth_date=date '2000-01-01' where id=?", child)
        admin.update("update forena.person_access set active=false where person_id=? and subject=?", child, fixture.subject)
        assertThat(accountRequest("/api/me/account/children/$child/follower", fixture.cookie, "POST").statusCode()).isEqualTo(403)
        assertThat(admin.queryForObject("select count(*) from forena.account_follower where subject=?", Int::class.java, fixture.subject)).isZero()
        assertThat(admin.queryForObject("select count(*) from forena.auth_mail_outbox where kind='follower'", Int::class.java)).isZero()
    }

    @ParameterizedTest
    @ValueSource(strings = ["request", "decide"])
    fun `follower writes recheck session after waiting for the account lock`(operation: String) {
        val fixture = profileFixture()
        val child = fixture.children[0]
        admin.update("update forena.person set birth_date=date '2000-01-01' where id=?", child)
        val follower = UUID.randomUUID()
        if (operation == "decide") admin.update("insert into forena.account_follower(id,subject,person_id,organization_id,state,expires_at) values(?,?,?,?,'approved',clock_timestamp()+interval '30 days')", follower, fixture.subject, child, fixture.organizations[0])
        val sessionId = admin.queryForObject("select session_id from forena.spring_session where principal_name=?", String::class.java, fixture.subject.toString())
        requireNotNull(admin.dataSource).connection.use { connection ->
            connection.autoCommit = false
            connection.prepareStatement("select subject from forena.account where subject=? for update").use {
                it.setObject(1, fixture.subject); it.executeQuery().close()
            }
            val result = CompletableFuture.supplyAsync {
                if (operation == "request") accountRequest("/api/me/account/children/$child/follower", fixture.cookie, "POST", expected = fixture.subject.toString())
                else accountRequest("/api/me/account/followers/$follower", fixture.cookie, "PUT", mapOf("state" to "revoked"), fixture.subject.toString())
            }
            try {
                org.awaitility.Awaitility.await().atMost(5, SECONDS).until {
                    requireNotNull(admin.queryForObject("select count(*) from pg_stat_activity where usename='forena_api_runtime' and wait_event_type='Lock'", Int::class.java)) > 0
                }
                admin.update("delete from forena.spring_session where session_id=?", sessionId)
            } finally { connection.rollback() }
            assertThat(result.get(10, SECONDS).statusCode()).isEqualTo(401)
        }
        assertThat(admin.queryForObject("select count(*) from forena.account_follower where subject=? and state='approved'", Int::class.java, fixture.subject)).isEqualTo(if (operation == "decide") 1 else 0)
    }

    @ParameterizedTest
    @ValueSource(strings = ["correct", "review"])
    fun `club account writes recheck mandate after waiting for their row lock`(operation: String) {
        val fixture = profileFixture()
        val child = fixture.children[0]
        admin.update("insert into forena.organization_member(organization_id,subject,role) values(?,?,'admin')", fixture.organizations[0], fixture.subject)
        val proposal = UUID.randomUUID()
        val (_, proposedEmail) = additionalAccount()
        admin.update("insert into forena.account_guardian_proposal(id,proposer,person_id,organization_id,guardian_email,operation) values(?,?,?,?,?,'add')", proposal, fixture.subject, child, fixture.organizations[0], proposedEmail)
        requireNotNull(admin.dataSource).connection.use { connection ->
            connection.autoCommit = false
            val lock = if (operation == "correct") "select id from forena.person where id=? for update" else "select id from forena.account_guardian_proposal where id=? for update"
            connection.prepareStatement(lock).use {
                it.setObject(1, if (operation == "correct") child else proposal); it.executeQuery().close()
            }
            val result = CompletableFuture.supplyAsync {
                if (operation == "correct") accountRequest("/api/teams/${fixture.teams[0]}/account-administration/people/$child/birth-date", fixture.cookie,
                    "PUT", mapOf("birthDate" to "2014-01-01", "revision" to 0), fixture.subject.toString())
                else accountRequest("/api/teams/${fixture.teams[0]}/account-administration/proposals/$proposal", fixture.cookie,
                    "PUT", mapOf("approve" to true), fixture.subject.toString())
            }
            try {
                org.awaitility.Awaitility.await().atMost(5, SECONDS).until {
                    requireNotNull(admin.queryForObject("select count(*) from pg_stat_activity where usename='forena_api_runtime' and wait_event_type='Lock'", Int::class.java)) > 0
                }
                admin.update("update forena.organization_member set active=false where subject=?", fixture.subject)
            } finally { connection.rollback() }
            assertThat(result.get(10, SECONDS).statusCode()).isEqualTo(403)
        }
        assertThat(admin.queryForObject("select birth_date::text from forena.person where id=?", String::class.java, child)).isEqualTo("2015-01-01")
        assertThat(admin.queryForObject("select state from forena.account_guardian_proposal where id=?", String::class.java, proposal)).isEqualTo("pending")
    }

    @Test fun `email cancellation expiry and occupied addresses cannot change login identity`() {
        val fixture = profileFixture()
        val (_, occupied) = additionalAccount()
        assertThat(accountRequest("/api/me/account/email", fixture.cookie, "POST", mapOf("email" to occupied)).statusCode()).isEqualTo(400)
        val proposed = "pending-${UUID.randomUUID()}@example.invalid"
        fun begin(): String {
            clearLimits()
            assertThat(accountRequest("/api/me/account/email", fixture.cookie, "POST", mapOf("email" to proposed)).statusCode()).isEqualTo(200)
            val row = admin.queryForMap("select id,encrypted_link from forena.auth_mail_outbox where recipient=? order by expires_at desc limit 1", proposed)
            return URI(settings.decrypt(row["encrypted_link"].toString(), row["id"].toString())).query.substringAfter('=')
        }
        val cancelled = begin()
        assertThat(accountRequest("/api/me/account/email", fixture.cookie, "DELETE").statusCode()).isEqualTo(200)
        assertThat(accountRequest("/api/me/account/email/confirm", fixture.cookie, "POST", mapOf("code" to cancelled)).statusCode()).isEqualTo(403)
        val expired = begin()
        admin.update("update forena.account_email_change set expires_at=clock_timestamp()-interval '1 second' where subject=?", fixture.subject)
        assertThat(accountRequest("/api/me/account/email/confirm", fixture.cookie, "POST", mapOf("code" to expired)).statusCode()).isEqualTo(403)
        assertThat(request("/api/auth/session", cookie=fixture.cookie).body()).contains(email).doesNotContain(proposed, occupied)
    }
    @Test fun `five minute verification expires and can be renewed without changing the account`() {
        val fixture = profileFixture()
        val sessionId = admin.queryForObject("select session_id from forena.spring_session where principal_name=?", String::class.java, fixture.subject.toString())
        @Suppress("UNCHECKED_CAST")
        val sessionRepository = sessions as org.springframework.session.SessionRepository<org.springframework.session.Session>
        val current = requireNotNull(sessionRepository.findById(requireNotNull(sessionId)))
        current.setAttribute("forena.recent-authentication", "${fixture.subject}\n0\n${System.currentTimeMillis()-300001}")
        sessionRepository.save(current)
        assertThat(accountRequest("/api/me/account/password", fixture.cookie, "PUT", mapOf("password" to "new-synthetic-password")).statusCode()).isEqualTo(403)
        assertThat(accountRequest("/api/me/account/reauthenticate", fixture.cookie, "POST", mapOf("password" to "incorrect-password")).statusCode()).isEqualTo(403)
        assertThat(accountRequest("/api/me/account/reauthenticate", fixture.cookie, "POST", mapOf("password" to password)).statusCode()).isEqualTo(200)
        assertThat(accountRequest("/api/me/account/password", fixture.cookie, "PUT", mapOf("password" to "new-synthetic-password")).statusCode()).isEqualTo(200)
        assertThat(request("/api/auth/session", cookie=fixture.cookie).statusCode()).isEqualTo(200)
    }
    @Test fun `only loss of the final approved connection starts grace and a new connection cancels deletion`() {
        val fixture = profileFixture()
        lifecycle.connectionsChanged(fixture.subject)
        admin.update("update forena.person_access set active=false where subject=? and organization_id=?", fixture.subject, fixture.organizations[0])
        lifecycle.connectionsChanged(fixture.subject)
        assertThat(admin.queryForObject("select disconnected_at is null from forena.account_lifecycle where subject=?", Boolean::class.java, fixture.subject)).isTrue()
        admin.update("update forena.person_access set active=false where subject=?", fixture.subject)
        lifecycle.connectionsChanged(fixture.subject)
        assertThat(admin.queryForObject("select disconnected_at is not null from forena.account_lifecycle where subject=?", Boolean::class.java, fixture.subject)).isTrue()
        admin.update("update forena.person_access set active=true where subject=? and person_id=?", fixture.subject, fixture.own[0])
        lifecycle.connectionsChanged(fixture.subject)
        assertThat(admin.queryForObject("select disconnected_at is null from forena.account_lifecycle where subject=?", Boolean::class.java, fixture.subject)).isTrue()
        assertThat(accountRequest("/api/me/account", fixture.cookie).statusCode()).isEqualTo(200)
    }

    @Test fun `guardian approval cannot revive an account whose thirty day deadline has passed`() {
        val fixture = profileFixture()
        val (guardian, address) = additionalAccount()
        val formerPerson = UUID.randomUUID()
        admin.update("insert into forena.person(id,organization_id,display_name) values(?,?,'Former member')", formerPerson, fixture.organizations[0])
        admin.update("insert into forena.person_access(person_id,organization_id,subject,kind) values(?,?,?,'self')", formerPerson, fixture.organizations[0], guardian)
        lifecycle.connectionsChanged(guardian)
        admin.update("update forena.person_access set active=false where subject=?", guardian)
        lifecycle.connectionsChanged(guardian)
        admin.update("update forena.account_lifecycle set disconnected_at=clock_timestamp()-interval '30 days' where subject=?", guardian)
        admin.update("insert into forena.organization_member(organization_id,subject,role) values(?,?,'admin')", fixture.organizations[0], fixture.subject)
        val child = fixture.children[0]
        assertThat(accountRequest("/api/me/account/children/$child/proposals", fixture.cookie, "POST", mapOf("email" to address, "operation" to "add")).statusCode()).isEqualTo(200)
        val proposal = admin.queryForObject("select id from forena.account_guardian_proposal where person_id=?", UUID::class.java, child)
        assertThat(accountRequest("/api/teams/${fixture.teams[0]}/account-administration/proposals/$proposal", fixture.cookie, "PUT", mapOf("approve" to true)).statusCode()).isEqualTo(400)
        assertThat(admin.queryForObject("select count(*) from forena.person_access where subject=? and kind='guardian' and active", Int::class.java, guardian)).isZero()
        lifecycle.connectionsChanged(guardian)
        assertThat(admin.queryForObject("select count(*) from forena.native_user where subject=?", Int::class.java, guardian)).isZero()
    }

    @Test fun `revocation while a security command waits for the account lock prevents its write`() {
        val fixture = profileFixture()
        assertThat(accountRequest("/api/me/account/email", fixture.cookie, "POST", mapOf("email" to "waiting-${UUID.randomUUID()}@example.invalid")).statusCode()).isEqualTo(200)
        val sessionId = admin.queryForObject("select session_id from forena.spring_session where principal_name=?", String::class.java, fixture.subject.toString())
        requireNotNull(admin.dataSource).connection.use { connection ->
            connection.autoCommit = false
            connection.prepareStatement("select subject from forena.account where subject=? for update").use {
                it.setObject(1, fixture.subject); it.executeQuery().close()
            }
            val result = CompletableFuture.supplyAsync {
                accountRequest("/api/me/account/email", fixture.cookie, "DELETE", expected = fixture.subject.toString())
            }
            try {
                org.awaitility.Awaitility.await().atMost(5, SECONDS).until {
                    requireNotNull(admin.queryForObject("select count(*) from pg_stat_activity where usename='forena_api_runtime' and wait_event_type='Lock'", Int::class.java)) > 0
                }
                admin.update("delete from forena.spring_session where session_id=?", sessionId)
            } finally { connection.rollback() }
            assertThat(result.get(10, SECONDS).statusCode()).isEqualTo(401)
        }
        assertThat(admin.queryForObject("select count(*) from forena.account_email_change where subject=?", Int::class.java, fixture.subject)).isEqualTo(1)
    }

}
