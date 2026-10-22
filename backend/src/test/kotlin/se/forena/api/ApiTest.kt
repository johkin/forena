package se.forena.api

import com.nimbusds.jose.JOSEObjectType
import com.nimbusds.jose.JWSAlgorithm
import com.nimbusds.jose.JWSHeader
import com.nimbusds.jose.crypto.RSASSASigner
import com.nimbusds.jose.crypto.ECDSASigner
import com.nimbusds.jose.crypto.MACSigner
import com.nimbusds.jose.jwk.Curve
import com.nimbusds.jose.jwk.JWKSet
import com.nimbusds.jose.jwk.RSAKey
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator
import com.nimbusds.jose.jwk.gen.ECKeyGenerator
import com.nimbusds.jwt.JWTClaimsSet
import com.nimbusds.jwt.SignedJWT
import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.sql.DriverManager
import java.time.Instant
import java.util.Date
import java.util.UUID
import java.util.concurrent.CompletableFuture
import java.nio.file.Files
import java.nio.file.Path
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.awaitility.Awaitility.await
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.core.env.Environment
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean
import org.mockito.Mockito.clearInvocations
import org.mockito.Mockito.verifyNoInteractions
import se.forena.api.activities.internal.InvitationHistoryRepository
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import se.forena.api.activities.internal.InvitationRepository
import org.testcontainers.postgresql.PostgreSQLContainer
import tools.jackson.databind.json.JsonMapper

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ApiTest {
    companion object {
        val database = PostgreSQLContainer("postgres:17.6-alpine").withInitScript("init.sql").also { it.start() }
        var key = RSAKeyGenerator(2048).keyID("first").generate()
        val ecKey = ECKeyGenerator(Curve.P_256).keyID("ec").generate()
        @Volatile var jwksAvailable = true
        val providerSessions = java.util.concurrent.ConcurrentHashMap<UUID,UUID>()
        val providerUsers = java.util.concurrent.ConcurrentHashMap<UUID,String>()
        val providerCalls = java.util.concurrent.atomic.AtomicInteger()
        val providerRedirects = java.util.concurrent.atomic.AtomicInteger()
        @Volatile var providerStatus = 200
        @Volatile var providerBody: String? = null
        @Volatile var providerDelayMillis = 0L
        @Volatile var loginAccess = ""
        @Volatile var refreshAccess = ""
        @Volatile var refreshStatus = 200
        val passwordCalls = java.util.concurrent.atomic.AtomicInteger()
        val passkeyCalls = java.util.concurrent.atomic.AtomicInteger()
        val refreshCount = java.util.concurrent.atomic.AtomicInteger()
        val passkeyChallenges = java.util.concurrent.ConcurrentHashMap.newKeySet<String>()
        val providerJson = JsonMapper.builder().build()
        val jwks = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0).also { server ->
            server.createContext("/jwks") { exchange ->
                val bytes = JWKSet(listOf(key.toPublicJWK(), ecKey.toPublicJWK())).toString().toByteArray()
                exchange.responseHeaders.add("Content-Type", "application/json")
                exchange.sendResponseHeaders(if (jwksAvailable) 200 else 503, bytes.size.toLong())
                exchange.responseBody.use { it.write(bytes) }
            }
            server.createContext("/auth/v1/user") { exchange ->
                providerCalls.incrementAndGet()
                val claims = SignedJWT.parse(exchange.requestHeaders.getFirst("Authorization").removePrefix("Bearer ")).jwtClaimsSet
                val subject = UUID.fromString(claims.subject)
                val session = UUID.fromString(claims.getStringClaim("session_id"))
                val error = if (providerSessions[session] != subject) "session_not_found" else providerUsers[subject] ?: "user_not_found"
                val status = if (providerStatus != 200) providerStatus else if (error == "active") 200 else 403
                val body = providerBody ?: if (status == 200) """{"id":"$subject","is_anonymous":false,"user_metadata":{"role":"admin"}}"""
                    else """{"code":$status,"error_code":"${if (providerStatus != 200) "unexpected_failure" else error}"}"""
                assertThat(exchange.requestHeaders.getFirst("apikey")).isEqualTo("sb_publishable_local_test")
                Thread.sleep(providerDelayMillis)
                val bytes = body.toByteArray()
                exchange.responseHeaders.add("Content-Type","application/json")
                if (status == 302) exchange.responseHeaders.add("Location","http://127.0.0.1:${server.address.port}/redirect-target")
                runCatching {
                    exchange.sendResponseHeaders(status,bytes.size.toLong())
                    exchange.responseBody.use { it.write(bytes) }
                }
            }
            fun reply(exchange: com.sun.net.httpserver.HttpExchange, status: Int, body: String) {
                val bytes = body.toByteArray()
                exchange.responseHeaders.add("Content-Type", "application/json")
                exchange.sendResponseHeaders(status, bytes.size.toLong())
                exchange.responseBody.use { it.write(bytes) }
            }
            server.createContext("/auth/v1/token") { exchange ->
                assertThat(exchange.requestHeaders.getFirst("apikey")).isEqualTo("sb_publishable_local_test")
                val body = providerJson.readTree(exchange.requestBody.readAllBytes())
                val refreshing = exchange.requestURI.rawQuery == "grant_type=refresh_token"
                if (refreshing) {
                    refreshCount.incrementAndGet()
                    assertThat(body.get("refresh_token").asString()).isIn("synthetic-refresh", "rotated-refresh")
                    reply(exchange, refreshStatus, if (refreshStatus == 200) """{"access_token":"$refreshAccess","refresh_token":"rotated-refresh"}""" else "{}")
                } else {
                    passwordCalls.incrementAndGet()
                    if (body.get("password")?.asString() != "synthetic-password") reply(exchange, 400, "{}")
                    else reply(exchange, 200, """{"access_token":"$loginAccess","refresh_token":"synthetic-refresh"}""")
                }
            }
            server.createContext("/auth/v1/passkeys/authentication/options") { exchange ->
                passkeyCalls.incrementAndGet()
                val id = UUID.randomUUID().toString(); passkeyChallenges.add(id)
                reply(exchange, 200, """{"challenge_id":"$id","expires_at":${Instant.now().epochSecond + 300},"options":{"challenge":"c3ludGhldGlj","rpId":"localhost","userVerification":"required"}}""")
            }
            server.createContext("/auth/v1/passkeys/authentication/verify") { exchange ->
                passkeyCalls.incrementAndGet()
                val body = providerJson.readTree(exchange.requestBody.readAllBytes())
                val valid = passkeyChallenges.remove(body.get("challenge_id").asString())
                reply(exchange, if (valid) 200 else 400, if (valid) """{"access_token":"$loginAccess","refresh_token":"synthetic-refresh"}""" else "{}")
            }
            server.createContext("/auth/v1/logout") { exchange ->
                assertThat(exchange.requestURI.rawQuery).isEqualTo("scope=local")
                val jwt = SignedJWT.parse(exchange.requestHeaders.getFirst("Authorization").removePrefix("Bearer ")).jwtClaimsSet
                providerSessions.remove(UUID.fromString(jwt.getStringClaim("session_id")))
                exchange.sendResponseHeaders(204, -1); exchange.close()
            }
            server.createContext("/redirect-target") { exchange ->
                providerRedirects.incrementAndGet()
                exchange.sendResponseHeaders(500,-1); exchange.close()
            }
            server.executor = java.util.concurrent.Executors.newCachedThreadPool()
            server.start()
        }
        val issuer = "http://127.0.0.1:${jwks.address.port}/auth/v1"
        @JvmStatic @DynamicPropertySource
        fun properties(registry: DynamicPropertyRegistry) {
            registry.add("spring.datasource.url") { database.jdbcUrl }
            registry.add("spring.datasource.username") { "forena_api_runtime" }
            registry.add("spring.datasource.password") { "local-runtime-only" }
            registry.add("spring.datasource.hikari.maximum-pool-size") { 4 }
            registry.add("spring.liquibase.enabled") { true }
            registry.add("spring.liquibase.user") { "forena_api_owner" }
            registry.add("spring.liquibase.password") { "local-owner-only" }
            registry.add("forena.web-session.enabled") { true }
            registry.add("forena.web-session.origin") { "https://app.example.invalid" }
            registry.add("forena.web-session.key") { java.util.Base64.getEncoder().encodeToString(ByteArray(32) { 7 }) }
            registry.add("forena.auth.issuer") { issuer }
            registry.add("forena.auth.publishable-key") { "sb_publishable_local_test" }
            registry.add("forena.auth.jwks-uri") { "http://127.0.0.1:${jwks.address.port}/jwks" }
        }
    }
    @Autowired lateinit var environment: Environment
    @Autowired lateinit var jdbc: JdbcTemplate
    @Autowired lateinit var transactionManager: PlatformTransactionManager
    @MockitoSpyBean lateinit var releaseAccess: DatabaseAccessVerifier
    @MockitoSpyBean lateinit var historyRecords: InvitationHistoryRepository
    @Autowired lateinit var invitationRecords: InvitationRepository
    @Autowired lateinit var json: JsonMapper
    @Autowired lateinit var loginLimiter: se.forena.api.identity.BrowserLoginLimiter
    @Autowired lateinit var browserSettings: se.forena.api.identity.BrowserSessionSettings
    private val admin by lazy { JdbcTemplate(DriverManagerDataSource(database.jdbcUrl, database.username, database.password)) }
    private lateinit var parent: UUID
    private lateinit var outsider: UUID
    private lateinit var own: UUID
    private lateinit var child1: UUID
    private lateinit var child2: UUID
    private lateinit var other: UUID
    private lateinit var organization: UUID
    private lateinit var activity: UUID
    private lateinit var session: UUID
    private lateinit var invitation: UUID

    @BeforeEach fun seed() {
        admin.update("delete from forena.auth_rate_limit")
        admin.update("delete from forena.spring_session")
        passwordCalls.set(0); passkeyCalls.set(0)
        refreshCount.set(0); refreshStatus = 200; passkeyChallenges.clear()
        parent = UUID.randomUUID(); outsider = UUID.randomUUID(); session = UUID.randomUUID()
        organization = UUID.randomUUID(); activity = UUID.randomUUID()
        own = UUID.randomUUID(); child1 = UUID.randomUUID(); child2 = UUID.randomUUID(); other = UUID.randomUUID()
        admin.update("insert into forena.account(subject) values(?),(?)", parent, outsider)
        providerUsers[parent] = "active"; providerUsers[outsider] = "active"
        providerSessions[session] = parent; providerSessions[outsider] = outsider
        admin.update("insert into forena.organization(id,name) values(?,'Klubb')", organization)
        for ((index, person) in listOf(own, child1, child2, other).withIndex()) {
            admin.update("insert into forena.person(id,organization_id,display_name) values(?,?,?)", person, organization, "Person $index")
            admin.update("insert into forena.person_access(person_id,organization_id,subject,kind) values(?,?,?,?)",
                person, organization, if (person == other) outsider else parent, if (person in listOf(child1, child2)) "guardian" else "self")
        }
        val team = UUID.randomUUID()
        admin.update("insert into forena.team(id,organization_id,name) values(?,?,'Lag')", team, organization)
        admin.update("insert into forena.activity(id,organization_id,team_id,title,starts_at,ends_at) values(?,?,?,'Träning',now()+interval '1 hour',now()+interval '2 hours')", activity, organization, team)
        for (person in listOf(own, child1, child2, other)) {
            val id = UUID.randomUUID()
            if (person == child1) invitation = id
            admin.update("insert into forena.invitation(id,organization_id,activity_id,person_id) values(?,?,?,?)", id, organization, activity, person)
        }
    }

    private fun token(subject: UUID = parent, signingKey: RSAKey = key, changes: Map<String, Any?> = emptyMap()): String {
        val claims = mutableMapOf<String, Any?>("iss" to issuer, "sub" to subject.toString(), "aud" to listOf("authenticated"),
            "role" to "authenticated", "session_id" to (if (subject == outsider) outsider else session).toString(), "is_anonymous" to false,
            "email" to "family@example.invalid", "iat" to Date.from(Instant.now().minusSeconds(1)), "exp" to Date.from(Instant.now().plusSeconds(300)))
        claims.putAll(changes)
        val builder = JWTClaimsSet.Builder()
        claims.forEach { (k,v) -> if (v != null) builder.claim(k,v) }
        return SignedJWT(JWSHeader.Builder(JWSAlgorithm.RS256).type(JOSEObjectType.JWT).keyID(signingKey.keyID).build(), builder.build())
            .also { it.sign(RSASSASigner(signingKey)) }.serialize()
    }
    private fun request(path: String, body: String? = null, bearer: String? = token(), cookie: String? = null): HttpResponse<String> {
        val request = HttpRequest.newBuilder(URI("http://127.0.0.1:${environment.getRequiredProperty("local.server.port")}$path"))
        bearer?.let { request.header("Authorization", "Bearer $it") }
        cookie?.let { request.header("Cookie", it) }
        if (body == null) request.GET() else request.header("Content-Type", "application/json").PUT(HttpRequest.BodyPublishers.ofString(body))
        return HttpClient.newHttpClient().send(request.build(), HttpResponse.BodyHandlers.ofString())
    }
    private fun respond(body: String, bearer: String = token()) = request("/api/invitations/$invitation/respond", body, bearer)
    private fun row() = admin.queryForMap("select * from forena.invitation where id=?", invitation)
    private fun history() = admin.queryForObject("select count(*) from forena.invitation_history where invitation_id=?", Long::class.java, invitation)!!
    private fun dirty() = admin.queryForObject("select coalesce((select dirty_revision from forena.activity_signal_state where activity_id=?),0)", Long::class.java, activity)!!

    private fun browser(path: String, body: String? = null, cookie: String? = null,
                        origin: String? = "https://app.example.invalid", marker: Boolean = true, method: String? = null, expectedAccount: UUID? = parent): HttpResponse<String> {
        val request = HttpRequest.newBuilder(URI("http://127.0.0.1:${environment.getRequiredProperty("local.server.port")}$path"))
        cookie?.let { request.header("Cookie", it) }
        expectedAccount?.let { request.header("X-Forena-Account", it.toString()) }
        origin?.let { request.header("Origin", it) }
        if (marker) request.header("X-Forena-Request", "1")
        if (body == null) request.GET() else request.header("Content-Type", "application/json")
            .method(method ?: "POST", HttpRequest.BodyPublishers.ofString(body))
        return HttpClient.newHttpClient().send(request.build(), HttpResponse.BodyHandlers.ofString())
    }
    private fun sessionCookie(result: HttpResponse<String>) = result.headers().allValues("set-cookie")
        .single { it.startsWith("__Host-forena-session=") }.substringBefore(';')
    @org.springframework.beans.factory.annotation.Autowired
    lateinit var springSessions: org.springframework.session.jdbc.JdbcIndexedSessionRepository
    @Suppress("UNCHECKED_CAST")
    private fun browserStore() = springSessions as org.springframework.session.SessionRepository<org.springframework.session.Session>
    private fun storedBrowserSession(): org.springframework.session.Session {
        val id = jdbc.queryForObject("select session_id from forena.spring_session where principal_name=?", String::class.java, parent.toString())!!
        return browserStore().findById(id)!!
    }
    private fun expireProviderToken() {
        val session = storedBrowserSession()
        val state = browserSettings.decrypt(session.getAttribute<String>(se.forena.api.identity.BrowserSessionService.TOKENS)!!, session.id).split('\n').toMutableList()
        state[2] = "0"
        session.setAttribute(se.forena.api.identity.BrowserSessionService.TOKENS, browserSettings.encrypt(state.joinToString("\n"), session.id))
        browserStore().save(session)
    }
    private fun browserLogin(): HttpResponse<String> {
        loginAccess = token(); refreshAccess = token()
        return browser("/api/auth/login", """{"email":"family@example.invalid","password":"synthetic-password"}""")
    }

    @Test
    @org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable(named = "FORENA_LOCAL_BROWSER_TEST", matches = "true")
    fun `real browser uses Kotlin sessions and PostgreSQL without browser tokens`() {
        loginAccess = token(); refreshAccess = token()
        val process = ProcessBuilder("node", "scripts/migration/browser-server-session.mjs")
            .directory(Path.of("..").toFile()).redirectErrorStream(true)
            .redirectOutput(Path.of("target/browser-server-session.log").toFile())
        val executable = System.getenv("FORENA_BROWSER_EXECUTABLE")
        process.environment().keys.removeIf { it.startsWith("FORENA_") }
        process.environment()["FORENA_BROWSER_API_BASE"] = "http://127.0.0.1:${environment.getRequiredProperty("local.server.port")}"
        process.environment()["FORENA_BROWSER_ACTIVITY_ID"] = activity.toString()
        if (executable != null) process.environment()["FORENA_BROWSER_EXECUTABLE"] = executable
        val child = process.start()
        try {
            assertThat(child.waitFor(60, java.util.concurrent.TimeUnit.SECONDS)).isTrue()
            assertThat(child.exitValue()).describedAs("See private target/browser-server-session.log").isZero()
            assertThat(row()["response"]).isEqualTo("accepted")
            assertThat(history()).isEqualTo(1)
            assertThat(jdbc.queryForObject("select count(*) from forena.spring_session where principal_name=?", Int::class.java, parent.toString())).isZero()
        } finally { child.destroyForcibly() }
    }

    @Test fun `failed password attempts consume shared client and normalized email limits before calling Auth`() {
        for (email in listOf("family@example.invalid", "FAMILY@example.invalid", " family@example.invalid ")) {
            assertThat(browser("/api/auth/login", """{"email":"$email","password":"wrong"}""").statusCode()).isEqualTo(401)
        }
        val denied = browser("/api/auth/login", """{"email":"family@example.invalid","password":"wrong"}""")
        assertThat(denied.statusCode()).isEqualTo(429)
        assertThat(denied.headers().firstValue("retry-after").orElseThrow().toLong()).isBetween(1L,60L)
        assertThat(denied.headers().firstValue("cache-control").orElseThrow()).isEqualTo("no-store")
        assertThat(passwordCalls.get()).isEqualTo(3)
        for (index in 1..2) assertThat(browser("/api/auth/login", """{"email":"other$index@example.invalid","password":"wrong"}""").statusCode()).isEqualTo(401)
        assertThat(browser("/api/auth/passkey/options", "{}").statusCode()).isEqualTo(429)
        assertThat(passkeyCalls.get()).isZero()
        assertThat(passwordCalls.get()).isEqualTo(5)
        val rows = jdbc.queryForList("select key_hash from forena.auth_rate_limit").toString()
        assertThat(rows).doesNotContain("family", "example.invalid", "127.0.0.1")
    }

    @Test fun `admission budget stays shared across instances under concurrent clients and recovers without waiting`() {
        val secondInstance = se.forena.api.identity.BrowserLoginLimiter(jdbc, TransactionTemplate(transactionManager), browserSettings, false)
        val requests = (1..25).map { index -> CompletableFuture.supplyAsync {
            try {
                (if (index % 2 == 0) loginLimiter else secondInstance).admit("client-$index", "email-$index@example.invalid")
                true
            } catch (_: org.springframework.web.ErrorResponseException) { false }
        } }
        assertThat(requests.count { it.get() }).isEqualTo(10)
        val rowCount = jdbc.queryForObject("select count(*) from forena.auth_rate_limit", Int::class.java)
        assertThat(rowCount).isEqualTo(21) // one global row, ten client/email pairs
        assertThatThrownBy { secondInstance.admit("new-client", "new@example.invalid") }
            .isInstanceOf(org.springframework.web.ErrorResponseException::class.java)
        assertThat(jdbc.queryForObject("select count(*) from forena.auth_rate_limit", Int::class.java)).isEqualTo(rowCount)
        admin.update("update forena.auth_rate_limit set available_at=clock_timestamp()-interval '1 second'")
        secondInstance.admit("new-client", "new@example.invalid")
    }

    @Test fun `an exhausted public login budget leaves session refresh and logout available`() {
        val cookie = sessionCookie(browserLogin())
        repeat(9) { loginLimiter.admit("other-client-$it", "other-$it@example.invalid") }
        assertThat(browser("/api/auth/login", """{"email":"fresh@example.invalid","password":"wrong"}""").statusCode()).isEqualTo(429)
        assertThat(browser("/api/auth/passkey/options", "{}").statusCode()).isEqualTo(429)
        assertThat(browser("/api/auth/passkey/verify", """{"challenge_id":"${UUID.randomUUID()}","credential":{}}""").statusCode()).isEqualTo(429)
        assertThat(passwordCalls.get()).isEqualTo(1)
        assertThat(passkeyCalls.get()).isZero()
        expireProviderToken()
        assertThat(browser("/api/auth/session", cookie=cookie).statusCode()).isEqualTo(200)
        assertThat(refreshCount.get()).isEqualTo(1)
        assertThat(browser("/api/auth/logout", "{}", cookie).statusCode()).isEqualTo(200)
    }

    @Test fun `browser login rotates opaque cookie stores encrypted tokens and preserves business authorization`() {
        val login = browserLogin()
        assertThat(login.statusCode()).isEqualTo(200)
        val cookie = sessionCookie(login)
        assertThat(login.headers().firstValue("set-cookie").orElseThrow()).contains("HttpOnly", "Secure", "SameSite=Lax", "Path=/").doesNotContain("Domain=")
        assertThat(login.body()).contains(parent.toString()).doesNotContain("access_token", "refresh_token", loginAccess, session.toString())
        val stored = storedBrowserSession()
        assertThat(stored.getAttribute<String>(se.forena.api.identity.BrowserSessionService.TOKENS)).doesNotContain(loginAccess, "synthetic-refresh")
        assertThat(stored.id).isNotEqualTo(cookie.substringAfter('='))
        assertThat(browser("/api/auth/session", cookie=cookie).statusCode()).isEqualTo(200)
        assertThat(browser("/api/activities/$activity/my-invitations", cookie=cookie).statusCode()).isEqualTo(200)
        assertThat(browser("/api/invitations/$invitation/respond", """{"response":"accepted"}""", cookie, method="PUT").statusCode()).isEqualTo(200)
        assertThat(history()).isEqualTo(1)
        // Reauthentication replaces the browser session, even for the same user.
        val next = browser("/api/auth/login", """{"email":"family@example.invalid","password":"synthetic-password"}""", cookie)
        assertThat(next.statusCode()).isEqualTo(200)
        assertThat(sessionCookie(next)).isNotEqualTo(cookie)
        assertThat(browser("/api/auth/session", cookie=cookie).statusCode()).isEqualTo(401)
        admin.update("insert into forena.revoked_session(id,subject) values(?,?)", session, parent)
        assertThat(browser("/api/auth/session", cookie=sessionCookie(next)).statusCode()).isEqualTo(401)
    }

    @Test fun `Spring session IDs read from the database cannot be replayed as browser cookies`() {
        val cookie = sessionCookie(browserLogin())
        val stored = storedBrowserSession()
        assertThat(browser("/api/auth/session", cookie="__Host-forena-session=${stored.id}").statusCode()).isEqualTo(401)
        assertThat(browser("/api/auth/session", cookie=cookie).statusCode()).isEqualTo(200)
        assertThat(browser("/api/auth/session", cookie="$cookie; $cookie").statusCode()).isEqualTo(401)
    }

    @Test fun `cookie writes and login require canonical origin and custom header while bearer clients remain valid`() {
        val cookie = sessionCookie(browserLogin())
        for (origin in listOf(null, "https://evil.invalid", "null")) {
            assertThat(browser("/api/auth/login", "{}", origin=origin).statusCode()).isEqualTo(403)
            assertThat(browser("/api/auth/logout", "{}", cookie, origin=origin).statusCode()).isEqualTo(403)
            assertThat(browser("/api/invitations/$invitation/respond", """{"response":"accepted"}""", cookie, origin=origin, method="PUT").statusCode()).isEqualTo(403)
        }
        assertThat(browser("/api/auth/passkey/options", "{}", marker=false).statusCode()).isEqualTo(403)
        assertThat(browser("/api/auth/logout", "{}", cookie, marker=false).statusCode()).isEqualTo(403)
        assertThat(browser("/api/invitations/$invitation/respond", """{"response":"accepted"}""", cookie, method="PUT", expectedAccount=outsider).statusCode()).isEqualTo(401)
        assertThat(browser("/api/invitations/$invitation/respond", """{"response":"accepted"}""", cookie, method="PUT", expectedAccount=null).statusCode()).isEqualTo(401)
        assertThat(history()).isZero()
        assertThat(request("/api/activities/$activity/my-invitations", cookie=cookie).statusCode()).isEqualTo(400)
        assertThat(request("/actuator/health", bearer=null).statusCode()).isEqualTo(200)
        assertThat(browser("/api/auth/session").statusCode()).isEqualTo(401)
        assertThat(respond("""{"response":"accepted"}""").statusCode()).isEqualTo(200)
    }

    @Test fun `shared session lock refreshes once across concurrent requests and preserves session on provider outage`() {
        val cookie = sessionCookie(browserLogin())
        expireProviderToken()
        refreshStatus = 503
        val unavailable = browser("/api/auth/session", cookie=cookie)
        assertThat(unavailable.statusCode()).isEqualTo(503)
        assertThat(unavailable.headers().firstValue("cache-control").orElseThrow()).isEqualTo("no-store")
        assertThat(unavailable.body()).doesNotContain(loginAccess, "synthetic-refresh")
        refreshCount.set(0); refreshStatus = 200
        val calls = (1..6).map { CompletableFuture.supplyAsync { browser("/api/auth/session", cookie=cookie) } }
        calls.forEach { assertThat(it.get().statusCode()).isEqualTo(200) }
        assertThat(refreshCount.get()).isEqualTo(1)
        assertThat(jdbc.queryForObject("select count(*) from forena.spring_session where principal_name=?", Int::class.java, parent.toString())).isEqualTo(1)
        expireProviderToken()
        refreshStatus = 400
        assertThat(browser("/api/auth/session", cookie=cookie).statusCode()).isEqualTo(401)
        assertThat(jdbc.queryForObject("select count(*) from forena.spring_session where principal_name=?", Int::class.java, parent.toString())).isZero()
    }

    @Test fun `maximum lifetime inactivity invalid cookie and logout deny further access`() {
        for (column in listOf("creation_time", "last_access_time")) {
            val cookie = sessionCookie(browserLogin())
            admin.update("update forena.spring_session set $column=0,expiry_time=0 where principal_name=?", parent.toString())
            assertThat(browser("/api/auth/session", cookie=cookie).statusCode()).isEqualTo(401)
        }
        assertThat(browser("/api/auth/session", cookie="__Host-forena-session=invalid").statusCode()).isEqualTo(401)
        val cookie = sessionCookie(browserLogin())
        val logout = browser("/api/auth/logout", "{}", cookie)
        assertThat(logout.statusCode()).isEqualTo(200)
        assertThat(logout.headers().allValues("set-cookie").joinToString()).contains("Max-Age=0", "HttpOnly", "Secure")
        assertThat(browser("/api/auth/session", cookie=cookie).statusCode()).isEqualTo(401)
        assertThat(request("/api/activities/$activity/my-invitations", bearer=loginAccess).statusCode()).isEqualTo(401)
        assertThat(browser("/api/auth/logout", "{}", cookie).statusCode()).isEqualTo(200)
    }

    @Test fun `passkey challenge is bound to the Spring session and cannot be replayed`() {
        loginAccess = token()
        val options = browser("/api/auth/passkey/options", "{}")
        assertThat(options.statusCode()).isEqualTo(200)
        val challenge = json.readTree(options.body()).get("challenge_id").asString()
        val cookie = options.headers().firstValue("set-cookie").orElseThrow().substringBefore(';')
        val body = """{"challenge_id":"$challenge","credential":{"id":"synthetic-assertion","type":"public-key"}}"""
        assertThat(browser("/api/auth/passkey/verify", body).statusCode()).isEqualTo(401)
        assertThat(browser("/api/auth/passkey/verify", body.replace(challenge, UUID.randomUUID().toString()), cookie).statusCode()).isEqualTo(401)
        val result = browser("/api/auth/passkey/verify", body, cookie)
        assertThat(result.statusCode()).isEqualTo(200)
        assertThat(result.body()).doesNotContain("access_token", "refresh_token")
        assertThat(browser("/api/auth/session", cookie=sessionCookie(result)).statusCode()).isEqualTo(200)
        assertThat(browser("/api/auth/passkey/verify", body, cookie).statusCode()).isEqualTo(401)
    }

    @Test fun `logout removes even unreadable session ciphertext and clears the browser cookie`() {
        val cookie = sessionCookie(browserLogin())
        val stored = storedBrowserSession()
        stored.setAttribute(se.forena.api.identity.BrowserSessionService.TOKENS, "unreadable-after-key-rotation")
        browserStore().save(stored)
        assertThat(browser("/api/auth/session", cookie=cookie).statusCode()).isEqualTo(401)
        val logout = browser("/api/auth/logout", "{}", cookie)
        assertThat(logout.statusCode()).isEqualTo(200)
        assertThat(logout.headers().allValues("set-cookie").joinToString()).contains("Max-Age=0")
        assertThat(jdbc.queryForObject("select count(*) from forena.spring_session where principal_name=?", Int::class.java, parent.toString())).isZero()
    }

    @Test fun `provider logout ban deletion and mismatched session deny reads and writes without effects`() {
        val bearer = token()
        fun denied() {
            assertThat(request("/api/activities/$activity/my-invitations", bearer=bearer).statusCode()).isEqualTo(401)
            assertThat(respond("""{"response":"accepted"}""", bearer).statusCode()).isEqualTo(401)
            assertThat(row()["revision"]).isEqualTo(0L)
            assertThat(history()).isZero(); assertThat(dirty()).isZero()
        }
        assertThat(request("/api/activities/$activity/my-invitations", bearer=bearer).statusCode()).isEqualTo(200)
        providerSessions.remove(session)
        denied()
        providerSessions[session] = outsider
        denied()
        providerSessions[session] = parent
        providerUsers[parent] = "user_banned"
        denied()
        providerUsers[parent] = "active"
        assertThat(request("/api/activities/$activity/my-invitations", bearer=bearer).statusCode()).isEqualTo(200)
        providerUsers.remove(parent)
        denied()
    }

    @Test fun `provider failures fail closed with no-store 503 and sanitized errors then recover`() {
        val bearer = token()
        assertThat(request("/api/activities/$activity/my-invitations", bearer=bearer).statusCode()).isEqualTo(200)
        try {
            for (status in listOf(302,429,500,401,403)) {
                providerStatus = status
                val result = respond("""{"response":"accepted"}""",bearer)
                assertThat(result.statusCode()).describedAs("provider HTTP $status").isEqualTo(503)
                assertThat(result.headers().firstValue("cache-control").orElse("")).contains("no-store")
                assertThat(result.body()).doesNotContain("unexpected_failure", parent.toString(), session.toString(), bearer)
                assertThat(history()).isZero(); assertThat(dirty()).isZero()
            }
            providerStatus = 200
            for (body in listOf("not-json", "{}")) {
                providerBody = body
                assertThat(respond("""{"response":"accepted"}""",bearer).statusCode()).isIn(401,503)
            }
        } finally { providerStatus = 200; providerBody = null }
        assertThat(providerRedirects.get()).isZero()
        assertThat(respond("""{"response":"accepted"}""",bearer).statusCode()).isEqualTo(200)
    }

    @Test fun `provider timeout denies mutation even with cached signing key`() {
        val bearer = token()
        assertThat(request("/api/activities/$activity/my-invitations",bearer=bearer).statusCode()).isEqualTo(200)
        providerDelayMillis = 2500
        try {
            assertThat(respond("""{"response":"accepted"}""",bearer).statusCode()).isEqualTo(503)
            assertThat(row()["revision"]).isEqualTo(0L)
            assertThat(history()).isZero(); assertThat(dirty()).isZero()
        } finally { providerDelayMillis = 0 }
    }

    @Test fun `invalid JWT never reaches provider and provider metadata grants no family access`() {
        val credential = token()
        val actor = se.forena.api.identity.Actor(parent,session,credential)
        assertThat(actor.toString()).doesNotContain(credential)
        assertThat(json.writeValueAsString(actor)).doesNotContain(credential)
        val before = providerCalls.get()
        assertThat(respond("""{"response":"accepted"}""", token(changes=mapOf("aud" to "wrong"))).statusCode()).isEqualTo(401)
        assertThat(providerCalls.get()).isEqualTo(before)
        assertThat(respond("""{"response":"accepted"}""", token(outsider)).statusCode()).isEqualTo(403)
    }

    @Test fun `logout committed during activity lock wait rejects the pending write`() {
        DriverManager.getConnection(database.jdbcUrl, database.username, database.password).use { connection ->
            connection.autoCommit = false
            connection.prepareStatement("select id from forena.activity where id=? for update").use {
                it.setObject(1,activity); it.executeQuery().close()
            }
            val result = CompletableFuture.supplyAsync { respond("""{"response":"accepted"}""") }
            try {
                await().atMost(java.time.Duration.ofSeconds(10)).until {
                    admin.queryForObject("select count(*) from pg_stat_activity where usename='forena_api_runtime' and wait_event_type='Lock'",Long::class.java)!! > 0
                }
                providerSessions.remove(session)
            } finally { connection.rollback() }
            assertThat(result.get(10,java.util.concurrent.TimeUnit.SECONDS).statusCode()).isEqualTo(401)
            assertThat(row()["revision"]).isEqualTo(0L)
            assertThat(history()).isZero(); assertThat(dirty()).isZero()
        }
    }

    @Test fun `my activities deduplicates own and delegated invitations without leaking unrelated activities`() {
        val result = request("/api/me/activities")
        assertThat(result.statusCode()).isEqualTo(200)
        assertThat(result.headers().firstValue("cache-control").orElse("")).contains("no-store")
        val page = json.readTree(result.body())
        assertThat(page.get("activities").size()).isEqualTo(1)
        assertThat(page.get("activities").get(0).get("id").asString()).isEqualTo(activity.toString())
        assertThat(page.get("activities").get(0).get("organization_name").asString()).isEqualTo("Klubb")
        assertThat(page.get("activities").get(0).get("team_name").asString()).isEqualTo("Lag")
        assertThat(page.get("next_offset").isNull).isTrue()
        val visible = page.get("activities").get(0).get("invitations")
        assertThat(visible.size()).isEqualTo(3)
        assertThat((0 until visible.size()).map { visible.get(it).get("person_id").asString() }).containsExactlyInAnyOrder(
            own.toString(), child1.toString(), child2.toString())
        assertThat((0 until visible.size()).map { visible.get(it).get("response").asString() }).containsOnly("pending")
        // Own access may be removed while delegated access remains.
        admin.update("update forena.person_access set active=false where person_id=?", own)
        assertThat(json.readTree(request("/api/me/activities").body()).get("activities").size()).isEqualTo(1)
        admin.update("update forena.person_access set active=false where subject=?", parent)
        val empty = request("/api/me/activities")
        assertThat(json.readTree(empty.body()).get("activities").size()).isZero()
        assertThat(empty.body()).doesNotContain(activity.toString(), "Träning", "Klubb", "Lag")
    }

    @Test fun `overview reflects direct answers preserves comments and hides revoked people`() {
        assertThat(respond("""{"response":"accepted","comment":"Hämtas senare"}""").statusCode()).isEqualTo(200)
        // A quick answer omits comment rather than clearing the existing text.
        assertThat(respond("""{"response":"declined"}""").statusCode()).isEqualTo(200)
        val visible = json.readTree(request("/api/me/activities").body()).get("activities").get(0).get("invitations")
        val answered = visible.single { it.get("id").asString() == invitation.toString() }
        assertThat(answered.get("response").asString()).isEqualTo("declined")
        assertThat(answered.get("response_comment").asString()).isEqualTo("Hämtas senare")
        admin.update("update forena.person_access set active=false where person_id=? and subject=?", child1, parent)
        val revoked = json.readTree(request("/api/me/activities").body()).get("activities").get(0).get("invitations")
        assertThat(revoked.size()).isEqualTo(2)
        assertThat((0 until revoked.size()).map { revoked.get(it).get("person_id").asString() }).doesNotContain(child1.toString())
    }

    @Test fun `my activities spans authorized organizations and excludes private activities in each`() {
        val authorized = mutableListOf(activity.toString())
        val hidden = mutableListOf<String>()
        for (subject in listOf(parent, outsider)) {
            val org = UUID.randomUUID(); val team = UUID.randomUUID(); val person = UUID.randomUUID(); val event = UUID.randomUUID()
            admin.update("insert into forena.organization(id,name) values(?,'Annan klubb')", org)
            admin.update("insert into forena.team(id,organization_id,name) values(?,?,'Annat lag')", team, org)
            admin.update("insert into forena.person(id,organization_id,display_name) values(?,?,'Annan person')", person, org)
            admin.update("insert into forena.person_access(person_id,organization_id,subject,kind) values(?,?,?,'guardian')", person, org, subject)
            admin.update("insert into forena.activity(id,organization_id,team_id,title,starts_at,ends_at) values(?,?,?,'Annan aktivitet',now()+interval '1 hour',now()+interval '2 hours')", event, org, team)
            admin.update("insert into forena.invitation(id,organization_id,activity_id,person_id) values(?,?,?,?)", UUID.randomUUID(), org, event, person)
            (if (subject == parent) authorized else hidden).add(event.toString())
        }
        val rows = json.readTree(request("/api/me/activities").body()).get("activities")
        val ids = (0 until rows.size()).map { rows.get(it).get("id").asString() }
        assertThat(ids).containsExactlyInAnyOrderElementsOf(authorized)
        assertThat(ids).doesNotContainAnyElementsOf(hidden)
    }

    @Test fun `overview hides cancelled ended distant and uninvited activities but includes declined and unsent`() {
        admin.update("update forena.activity set invitation_send_at=now()+interval '1 day' where id=?", activity)
        assertThat(json.readTree(request("/api/me/activities").body()).get("activities").size()).isEqualTo(1)
        val unsent = json.readTree(request("/api/me/activities").body()).get("activities").get(0)
        assertThat(unsent.get("invitations").size()).isZero()
        admin.update("update forena.activity set invitation_send_at=null where id=?", activity)
        assertThat(respond("""{"response":"declined"}""").statusCode()).isEqualTo(200)
        assertThat(json.readTree(request("/api/me/activities").body()).get("activities").size()).isEqualTo(1)
        for (update in listOf("status='cancelled'", "status='scheduled', starts_at=now()-interval '2 hours', ends_at=now()-interval '1 hour'",
                "starts_at=now()+interval '100 days', ends_at=now()+interval '101 days'")) {
            admin.update("update forena.activity set $update where id=?", activity)
            assertThat(json.readTree(request("/api/me/activities").body()).get("activities").size()).isZero()
        }
        admin.update("update forena.activity set starts_at=now(), ends_at=now()+interval '1 hour' where id=?", activity)
        // Only another person's invitation remains, including in the same organization.
        admin.update("delete from forena.invitation_history where invitation_id in (select id from forena.invitation where activity_id=?)", activity)
        admin.update("delete from forena.invitation where activity_id=? and person_id<>?", activity, other)
        assertThat(json.readTree(request("/api/me/activities").body()).get("activities").size()).isZero()
    }

    @Test fun `overview uses stable bounded pages and rejects invalid offsets and inactive sessions`() {
        val team = admin.queryForObject("select team_id from forena.activity where id=?", UUID::class.java, activity)!!
        val starts = Instant.now().plusSeconds(7200)
        for (index in 1..51) {
            val id = UUID.randomUUID()
            admin.update("insert into forena.activity(id,organization_id,team_id,title,starts_at,ends_at) values(?,?,?,? ,?,?)",
                id, organization, team, "Aktivitet $index", java.sql.Timestamp.from(starts), java.sql.Timestamp.from(starts.plusSeconds(3600)))
            admin.update("insert into forena.invitation(id,organization_id,activity_id,person_id) values(?,?,?,?)", UUID.randomUUID(), organization, id, own)
        }
        val first = json.readTree(request("/api/me/activities").body())
        val repeated = json.readTree(request("/api/me/activities").body())
        assertThat(first).isEqualTo(repeated)
        assertThat(first.get("activities").size()).isEqualTo(50)
        assertThat(first.get("next_offset").asInt()).isEqualTo(50)
        val last = json.readTree(request("/api/me/activities?offset=50").body())
        assertThat(last.get("activities").size()).isEqualTo(2)
        assertThat(last.get("next_offset").isNull).isTrue()
        val ids = (0 until first.get("activities").size()).map { first.get("activities").get(it).get("id").asString() }
        for (index in 0 until last.get("activities").size()) assertThat(ids).doesNotContain(last.get("activities").get(index).get("id").asString())
        for (offset in listOf("-1", "100001", "wrong")) assertThat(request("/api/me/activities?offset=$offset").statusCode()).isEqualTo(400)
        admin.update("update forena.account set enabled=false where subject=?", parent)
        assertThat(request("/api/me/activities").statusCode()).isEqualTo(401)
    }

    @Test fun `parent reads own and two children but not another family`() {
        val result = request("/api/activities/$activity/my-invitations")
        assertThat(result.statusCode()).isEqualTo(200)
        assertThat(result.headers().firstValue("cache-control").orElse("")).contains("no-store")
        val invitations = json.readTree(result.body()).get("invitations")
        val people = (0 until invitations.size()).map { invitations.get(it).get("person_id").asString() }
        assertThat(people).containsExactlyInAnyOrder(own.toString(), child1.toString(), child2.toString())
        assertThat(request("/api/activities/${UUID.randomUUID()}/my-invitations").statusCode()).isEqualTo(404)
    }

    @Test fun `reads rejected writes and identical responses never write history`() {
        clearInvocations(historyRecords)
        assertThat(request("/api/activities/$activity/my-invitations").statusCode()).isEqualTo(200)
        assertThat(respond("""{"response":"accepted"}""",token(outsider)).statusCode()).isEqualTo(403)
        verifyNoInteractions(historyRecords)
        assertThat(respond("""{"response":"accepted"}""").statusCode()).isEqualTo(200)
        assertThat(history()).isEqualTo(1)
        clearInvocations(historyRecords)
        assertThat(respond("""{"response":"accepted"}""").statusCode()).isEqualTo(200)
        assertThat(request("/api/activities/$activity/my-invitations").statusCode()).isEqualTo(200)
        verifyNoInteractions(historyRecords)
    }

    @Test fun `inactive family links deny reads even when the activity and organization exist`() {
        admin.update("update forena.person_access set active=false where subject=?",parent)
        assertThat(request("/api/activities/$activity/my-invitations").statusCode()).isEqualTo(404)
        admin.update("update forena.activity set invitation_send_at=now()+interval '1 day' where id=?",activity)
        assertThat(request("/api/activities/$activity/my-invitations").statusCode()).isEqualTo(404)
        assertThat(respond("""{"response":"accepted"}""").statusCode()).isEqualTo(403)
        assertThat(history()).isZero(); assertThat(dirty()).isZero()
    }

    @Test fun `unauthorized writes are rejected before locking another familys invitation`() {
        DriverManager.getConnection(database.jdbcUrl, database.username, database.password).use { connection ->
            connection.autoCommit = false
            connection.prepareStatement("select id from forena.invitation where id=? for update").use {
                it.setObject(1,invitation); it.executeQuery().close()
            }
            val result = CompletableFuture.supplyAsync { respond("""{"response":"accepted"}""", token(outsider)) }
            assertThat(result.get(5,java.util.concurrent.TimeUnit.SECONDS).statusCode()).isEqualTo(403)
        }
        assertThat(history()).isZero(); assertThat(dirty()).isZero()
    }

    @Test fun `answer change reset reload and comments preserve time and atomic history`() {
        val accepted = respond("""{"response":"accepted","comment":"  Ses snart  "}""")
        assertThat(accepted.statusCode()).isEqualTo(200)
        assertThat(accepted.body()).isEqualTo("{\"ok\":true}")
        val time = row()["responded_at"]
        assertThat(row()["response_comment"]).isEqualTo("Ses snart")
        assertThat(respond("""{"response":"accepted","comment":"Ny text"}""").statusCode()).isEqualTo(200)
        assertThat(row()["responded_at"]).isEqualTo(time)
        assertThat(history()).isEqualTo(2); assertThat(dirty()).isEqualTo(1)
        assertThat(respond("""{"response":"declined"}""").statusCode()).isEqualTo(200)
        assertThat(row()["response_comment"]).isEqualTo("Ny text")
        assertThat(respond("""{"response":"declined","comment":null}""").statusCode()).isEqualTo(200)
        assertThat(row()["response_comment"]).isNull()
        assertThat(respond("""{"response":"pending","comment":"ignoreras"}""").statusCode()).isEqualTo(200)
        assertThat(row()["responded_at"]).isNull(); assertThat(row()["response_comment"]).isNull()
        assertThat(row()["response"]).isEqualTo("pending")
        assertThat(history()).isEqualTo(5); assertThat(dirty()).isEqualTo(3)
        assertThat(request("/api/activities/$activity/my-invitations").body()).contains("pending")
        val audit = admin.queryForMap("select * from forena.invitation_history where invitation_id=? order by revision limit 1", invitation)
        assertThat(audit["actor_subject"]).isEqualTo(parent)
        assertThat(audit).doesNotContainKey("session_id")
        assertThat(audit["channel"]).isEqualTo("web")
    }

    @Test fun `repetition and concurrent identical requests have one revision and one side effect`() {
        val bearer = token()
        val results = (1..6).map { CompletableFuture.supplyAsync { respond("""{"response":"accepted"}""", bearer).statusCode() } }
        assertThat(results.map { it.get() }).containsOnly(200)
        assertThat(history()).isEqualTo(1); assertThat(dirty()).isEqualTo(1)
        assertThat(row()["revision"]).isEqualTo(1L)
    }

    @Test fun `invalid bodies and forged identity do not mutate anything`() {
        for (body in listOf("null", "[]", "{}", "{", """{"response":"yes"}""", """{"response":"accepted","comment":9}""",
            """{"response":null}""", """{"response":0}""", """{"response":"ACCEPTED"}""",
            """{"response":"accepted","commentProvided":true}""", """{"response":"accepted","comment":false}""",
            """{"response":"accepted","actor_id":"$outsider"}""")) {
            assertThat(respond(body).statusCode()).describedAs(body).isEqualTo(400)
        }
        assertThat(history()).isZero(); assertThat(dirty()).isZero()
        assertThat(respond("""{"response":"accepted","comment":"${"x".repeat(510)}"}""").statusCode()).isEqualTo(200)
        assertThat(row()["response_comment"].toString()).hasSize(500)
    }

    @Test fun `other family revoked links disabled account and local session revocation deny writes`() {
        assertThat(respond("""{"response":"accepted"}""", token(outsider)).statusCode()).isEqualTo(403)
        admin.update("update forena.person_access set active=false where person_id=? and subject=?", child1, parent)
        assertThat(respond("""{"response":"accepted"}""").statusCode()).isEqualTo(403)
        admin.update("update forena.account set enabled=false where subject=?", parent)
        assertThat(respond("""{"response":"accepted"}""").statusCode()).isEqualTo(401)
        admin.update("update forena.account set enabled=true where subject=?", parent)
        admin.update("insert into forena.revoked_session(id,subject) values(?,?)", session, parent)
        assertThat(respond("""{"response":"accepted"}""").statusCode()).isEqualTo(401)
        assertThat(request("/api/activities/$activity/my-invitations").statusCode()).isEqualTo(401)
        assertThat(history()).isZero(); assertThat(dirty()).isZero()
    }

    @Test fun `unsent cancelled ended and no-op responses are rejected while read is safe`() {
        admin.update("update forena.activity set invitation_send_at=now()+interval '1 day' where id=?", activity)
        assertThat(request("/api/activities/$activity/my-invitations").body()).isEqualTo("{\"invitations\":[]}")
        assertThat(respond("""{"response":"accepted"}""").statusCode()).isEqualTo(409)
        admin.update("update forena.activity set invitation_send_at=null,status='cancelled' where id=?", activity)
        assertThat(respond("""{"response":"pending"}""").statusCode()).isEqualTo(409)
        admin.update("update forena.activity set status='scheduled',starts_at=now()-interval '2 hours',ends_at=now()-interval '1 hour' where id=?", activity)
        assertThat(respond("""{"response":"accepted"}""").statusCode()).isEqualTo(409)
        assertThat(history()).isZero(); assertThat(dirty()).isZero()
    }

    @Test fun `real JWT validation rejects bad claims algorithms signatures and cookie fallback`() {
        assertThat(request("/api/activities/$activity/my-invitations", bearer=null).statusCode()).isEqualTo(401)
        assertThat(request("/api/activities/$activity/my-invitations", bearer=null, cookie="sb-test-auth-token=${token()}").statusCode()).isEqualTo(401)
        val invalid = listOf<Map<String, Any?>>(
            mapOf("iss" to "https://other.invalid/auth/v1"), mapOf("aud" to listOf("other")),
            mapOf("exp" to Date.from(Instant.now().minusSeconds(120))), mapOf("exp" to null), mapOf("iat" to null),
            mapOf("nbf" to Date.from(Instant.now().plusSeconds(120))), mapOf("iat" to Date.from(Instant.now().plusSeconds(120))),
            mapOf("sub" to "invalid"), mapOf("session_id" to "invalid"), mapOf("session_id" to null),
            mapOf("is_anonymous" to true), mapOf("role" to "service_role"), mapOf("client_id" to "mcp"), mapOf("scope" to "read"))
        for (claims in invalid) assertThat(respond("""{"response":"accepted"}""", token(changes=claims)).statusCode()).describedAs(claims.toString()).isEqualTo(401)
        val forged = RSAKeyGenerator(2048).keyID(key.keyID).generate()
        assertThat(respond("""{"response":"accepted"}""", token(signingKey=forged)).statusCode()).isEqualTo(401)
        val unsigned = com.nimbusds.jwt.PlainJWT(JWTClaimsSet.Builder().subject(parent.toString()).build()).serialize()
        assertThat(respond("""{"response":"accepted"}""", unsigned).statusCode()).isEqualTo(401)
        val claims = SignedJWT.parse(token()).jwtClaimsSet
        val hmac = SignedJWT(JWSHeader(JWSAlgorithm.HS256), claims).also { it.sign(MACSigner("x".repeat(64))) }.serialize()
        assertThat(respond("""{"response":"accepted"}""", hmac).statusCode()).isEqualTo(401)
        assertThat(history()).isZero()
    }

    @Test fun `ES256 web session works and user metadata cannot grant family access`() {
        val claims = SignedJWT.parse(token()).jwtClaimsSet
        val ec = SignedJWT(JWSHeader.Builder(JWSAlgorithm.ES256).keyID(ecKey.keyID).build(), claims)
            .also { it.sign(ECDSASigner(ecKey)) }.serialize()
        assertThat(request("/api/activities/$activity/my-invitations", bearer=ec).statusCode()).isEqualTo(200)
        val metadata = token(outsider, changes=mapOf("user_metadata" to mapOf("role" to "admin", "person_id" to child1.toString())))
        assertThat(respond("""{"response":"accepted"}""", metadata).statusCode()).isEqualTo(403)
    }

    @Test fun `JWKS key rotation works and an unknown key during outage fails closed`() {
        assertThat(request("/api/activities/$activity/my-invitations").statusCode()).isEqualTo(200)
        val rotated = RSAKeyGenerator(2048).keyID(UUID.randomUUID().toString()).generate()
        key = rotated
        assertThat(request("/api/activities/$activity/my-invitations").statusCode()).isEqualTo(200)
        jwksAvailable = false
        try {
            val health = request("/actuator/health", bearer=null)
            assertThat(health.statusCode()).isEqualTo(503)
            assertThat(json.readTree(health.body()).get("status").asString()).isEqualTo("DOWN")
            assertThat(health.body()).doesNotContain("components", "authKeys", "/jwks", "exception")
            // A cached, already trusted key remains usable during an outage.
            assertThat(request("/api/activities/$activity/my-invitations").statusCode()).isEqualTo(200)
            val unknown = RSAKeyGenerator(2048).keyID(UUID.randomUUID().toString()).generate()
            val result = respond("""{"response":"accepted"}""", token(signingKey=unknown))
            assertThat(result.statusCode()).isEqualTo(503)
            assertThat(result.headers().firstValue("cache-control").orElse("")).contains("no-store")
            assertThat(result.headers().firstValue("www-authenticate")).isEmpty()
            assertThat(result.body()).isEqualTo("""{"error":"Sessionen kan inte verifieras just nu."}""")
            assertThat(row()["revision"]).isEqualTo(0L)
            assertThat(history()).isZero(); assertThat(dirty()).isZero()
        } finally { jwksAvailable = true }
        assertThat(request("/actuator/health", bearer=null).statusCode()).isEqualTo(200)
    }

    @Test fun `release verification rejects missing grants while health only checks database connectivity`() {
        releaseAccess.verify()
        admin.execute("revoke insert on forena.team from forena_api_runtime")
        try {
            assertThatThrownBy { releaseAccess.verify() }.isInstanceOf(IllegalStateException::class.java)
            clearInvocations(releaseAccess)
            repeat(3) {
                val health = request("/actuator/health", bearer=null)
                assertThat(health.statusCode()).isEqualTo(200)
                assertThat(health.body()).doesNotContain("databaseAccess", "team", "exception")
            }
            verifyNoInteractions(releaseAccess)
        } finally { admin.execute("grant insert on forena.team to forena_api_runtime") }
        releaseAccess.verify()
    }

    @Test fun `runtime grants stay limited and Kotlin authorization survives rollback and connection reuse`() {
        assertThat(jdbc.queryForObject("select rolsuper or rolbypassrls from pg_roles where rolname=current_user", Boolean::class.java)).isFalse()
        assertThat(jdbc.queryForObject("select pg_has_role(current_user,'forena_api_owner','MEMBER')", Boolean::class.java)).isFalse()
        assertThat(jdbc.queryForObject("select has_schema_privilege(current_user,'forena','CREATE')", Boolean::class.java)).isFalse()
        assertThat(jdbc.queryForObject("select has_table_privilege(current_user,'forena.team','SELECT')", Boolean::class.java)).isTrue()
        assertThat(jdbc.queryForObject("select name from forena.team where id=(select team_id from forena.activity where id=?)", String::class.java, activity)).isEqualTo("Lag")
        // RLS is disabled: HTTP isolation must be proven without help from database policies.
        assertThat(jdbc.queryForObject("select count(*) from forena.invitation where activity_id=?", Long::class.java,activity)).isEqualTo(4)
        assertThatThrownBy { TransactionTemplate(transactionManager).executeWithoutResult {
            jdbc.update("update forena.invitation set revision=revision+1 where id=?", invitation)
            throw IllegalStateException("force rollback")
        } }.isInstanceOf(IllegalStateException::class.java)
        assertThat(history()).isZero(); assertThat(dirty()).isZero()
        repeat(3) {
            assertThat(respond("""{"response":"accepted"}""", token(outsider)).statusCode()).isEqualTo(403)
            assertThat(respond("""{"response":"accepted"}""").statusCode()).isEqualTo(200)
            val ownList = request("/api/activities/$activity/my-invitations", bearer=token(outsider))
            assertThat(ownList.statusCode()).isEqualTo(200)
            assertThat(ownList.body()).contains(other.toString()).doesNotContain(child1.toString(),own.toString())
        }
        for (sql in listOf("create table forena.forbidden(id int)", "alter table forena.team add column forbidden text",
            "drop table forena.team", "truncate forena.team", "select * from forena.databasechangelog",
            "update forena.databasechangeloglock set locked=true", "set role forena_api_owner")) {
            assertThatThrownBy { jdbc.execute(sql) }.describedAs(sql).isInstanceOf(org.springframework.dao.DataAccessException::class.java)
        }
    }

    @Test fun `Kotlin lifecycle check waits for a concurrent cancellation`() {
        DriverManager.getConnection(database.jdbcUrl, database.username, database.password).use { connection ->
            connection.autoCommit = false
            connection.prepareStatement("update forena.activity set status='cancelled' where id=?").use { it.setObject(1,activity); it.executeUpdate() }
            val result = CompletableFuture.supplyAsync { respond("""{"response":"accepted"}""") }
            await().atMost(java.time.Duration.ofSeconds(5)).until {
                admin.queryForObject("select exists(select 1 from pg_stat_activity where usename='forena_api_runtime' and wait_event_type='Lock')", Boolean::class.java) == true
            }
            connection.commit()
            assertThat(result.get().statusCode()).isEqualTo(409)
        }
        assertThat(history()).isZero(); assertThat(dirty()).isZero()
    }

    private fun awaitRuntimeLocks(count: Long) {
        await().atMost(java.time.Duration.ofSeconds(5)).until {
            admin.queryForObject("select count(*) from pg_stat_activity where usename='forena_api_runtime' and wait_event_type='Lock'", Long::class.java)!! >= count
        }
    }

    @Test fun `separate HTTP transactions serialize different answers with consistent revision history`() {
        DriverManager.getConnection(database.jdbcUrl, database.username, database.password).use { gate ->
            gate.autoCommit = false
            gate.prepareStatement("select id from forena.invitation where id=? for update").use { it.setObject(1,invitation); it.executeQuery().close() }
            val first = CompletableFuture.supplyAsync { respond("""{"response":"accepted"}""") }
            awaitRuntimeLocks(1)
            val second = CompletableFuture.supplyAsync { respond("""{"response":"declined"}""") }
            awaitRuntimeLocks(2)
            gate.commit()
            assertThat(first.get().statusCode()).isEqualTo(200)
            assertThat(second.get().statusCode()).isEqualTo(200)
        }
        assertThat(row()["response"]).isEqualTo("declined")
        assertThat(row()["revision"]).isEqualTo(2L)
        assertThat(history()).isEqualTo(2); assertThat(dirty()).isEqualTo(2)
        assertThat(admin.queryForObject("select previous_response from forena.invitation_history where invitation_id=? and revision=2", String::class.java, invitation)).isEqualTo("accepted")
    }

    @Test fun `different invitations serialize creation and increment of the shared activity signal`() {
        val secondId = admin.queryForObject("select id from forena.invitation where activity_id=? and person_id=?", UUID::class.java,activity,child2)!!
        DriverManager.getConnection(database.jdbcUrl, database.username, database.password).use { gate ->
            gate.autoCommit = false
            gate.prepareStatement("select id from forena.activity where id=? for update").use { it.setObject(1,activity); it.executeQuery().close() }
            val first = CompletableFuture.supplyAsync { respond("""{"response":"accepted"}""") }
            val second = CompletableFuture.supplyAsync { request("/api/invitations/$secondId/respond", """{"response":"accepted"}""") }
            awaitRuntimeLocks(2)
            gate.commit()
            assertThat(first.get().statusCode()).isEqualTo(200)
            assertThat(second.get().statusCode()).isEqualTo(200)
        }
        assertThat(dirty()).isEqualTo(2)
        assertThat(admin.queryForObject("select count(*) from forena.invitation_history where invitation_id in (?,?)", Long::class.java,invitation,secondId)).isEqualTo(2)
    }

    @Test fun `activity ending while waiting for a lock rejects the response using current time`() {
        admin.update("update forena.activity set starts_at=clock_timestamp()-interval '1 hour',ends_at=clock_timestamp()+interval '1 second' where id=?",activity)
        DriverManager.getConnection(database.jdbcUrl, database.username, database.password).use { gate ->
            gate.autoCommit = false
            gate.prepareStatement("select id from forena.activity where id=? for update").use { it.setObject(1,activity); it.executeQuery().close() }
            val result = CompletableFuture.supplyAsync { respond("""{"response":"accepted"}""") }
            awaitRuntimeLocks(1)
            await().atMost(java.time.Duration.ofSeconds(5)).until {
                admin.queryForObject("select ends_at<=clock_timestamp() from forena.activity where id=?",Boolean::class.java,activity) == true
            }
            gate.commit()
            assertThat(result.get().statusCode()).isEqualTo(409)
        }
        assertThat(history()).isZero(); assertThat(dirty()).isZero()
    }

    @Test fun `a different organization is invisible and composite foreign keys reject cross organization invitations`() {
        val foreignOrg = UUID.randomUUID(); val foreignPerson = UUID.randomUUID()
        val foreignActivity = UUID.randomUUID(); val foreignTeam = UUID.randomUUID(); val foreignInvitation = UUID.randomUUID()
        admin.update("insert into forena.organization(id,name) values(?,'Annan klubb')", foreignOrg)
        admin.update("insert into forena.person(id,organization_id,display_name) values(?,?,'Privat person')", foreignPerson,foreignOrg)
        admin.update("insert into forena.team(id,organization_id,name) values(?,?,'Privat lag')", foreignTeam,foreignOrg)
        admin.update("insert into forena.activity(id,organization_id,team_id,title,starts_at,ends_at) values(?,?,?,'Privat aktivitet',now()+interval '1 hour',now()+interval '2 hours')",foreignActivity,foreignOrg,foreignTeam)
        admin.update("insert into forena.invitation(id,organization_id,activity_id,person_id) values(?,?,?,?)",foreignInvitation,foreignOrg,foreignActivity,foreignPerson)
        assertThat(request("/api/activities/$foreignActivity/my-invitations").statusCode()).isEqualTo(404)
        assertThat(request("/api/invitations/$foreignInvitation/respond", """{"response":"accepted"}""").statusCode()).isEqualTo(403)
        assertThatThrownBy { admin.update("insert into forena.invitation(id,organization_id,activity_id,person_id) values(?,?,?,?)",UUID.randomUUID(),organization,activity,foreignPerson) }
            .isInstanceOf(org.springframework.dao.DataIntegrityViolationException::class.java)
    }

    @Test fun `audit failure rolls back the answer revision and signal version`() {
        admin.execute("alter table forena.invitation_history add constraint test_audit_failure check(false) not valid")
        try {
            assertThat(respond("""{"response":"accepted"}""").statusCode()).isEqualTo(409)
            assertThat(row()["response"]).isEqualTo("pending")
            assertThat(row()["revision"]).isEqualTo(0L)
            assertThat(history()).isZero(); assertThat(dirty()).isZero()
        } finally { admin.execute("alter table forena.invitation_history drop constraint test_audit_failure") }
    }

    @Test fun `signal failure rolls back answer history and revision together`() {
        admin.execute("alter table forena.activity_signal_state add constraint test_signal_failure check(false) not valid")
        try {
            assertThat(respond("""{"response":"accepted"}""").statusCode()).isEqualTo(409)
            assertThat(row()["response"]).isEqualTo("pending")
            assertThat(row()["revision"]).isEqualTo(0L)
            assertThat(history()).isZero(); assertThat(dirty()).isZero()
        } finally { admin.execute("alter table forena.activity_signal_state drop constraint test_signal_failure") }
    }

    @Test fun `unicode comment truncation does not split surrogate pairs`() {
        assertThat(respond("""{"response":"accepted","comment":"${"😀".repeat(501)}"}""").statusCode()).isEqualTo(200)
        assertThat(row()["response_comment"]).isEqualTo("😀".repeat(500))
    }

    @Test fun `composite guardian identity keeps two guardians independent`() {
        admin.update("insert into forena.person_access(person_id,organization_id,subject,kind) values(?,?,?,'guardian')",child1,organization,outsider)
        assertThat(respond("""{"response":"accepted"}""", token(outsider)).statusCode()).isEqualTo(200)
        admin.update("update forena.person_access set active=false where person_id=? and subject=?",child1,outsider)
        assertThat(respond("""{"response":"declined"}""", token(outsider)).statusCode()).isEqualTo(403)
        assertThat(respond("""{"response":"declined"}""").statusCode()).isEqualTo(200)
        assertThat(history()).isEqualTo(2)
    }

    @Test fun `repository save cannot write immutable invitation identity`() {
        TransactionTemplate(transactionManager).executeWithoutResult {
            val current = invitationRecords.findLockedByIdAndOrganizationIdAndActivityIdAndPersonId(invitation,organization,activity,child1)!!
            invitationRecords.save(current.copy(response="accepted", personId=other, organizationId=UUID.randomUUID(),
                activityId=UUID.randomUUID(), revision=1, respondedAt=Instant.now()))
        }
        val saved = row()
        assertThat(saved["person_id"]).isEqualTo(child1)
        assertThat(saved["organization_id"]).isEqualTo(organization)
        assertThat(saved["activity_id"]).isEqualTo(activity)
        assertThat(saved["revision"]).isEqualTo(1L)
        assertThat(saved["responded_at"].toString()).doesNotContain("1970")
        // No hidden trigger writes history; the service explicitly owns that operation.
        assertThat(history()).isZero()
    }

    @Test fun `springdoc exports the implemented typed authenticated API for client generation`() {
        assertThat(request("/v3/api-docs", bearer=null).statusCode()).isEqualTo(401)
        val result = request("/v3/api-docs")
        assertThat(result.statusCode()).isEqualTo(200)
        val document = json.readTree(result.body())
        for (path in listOf("/api/auth/login", "/api/auth/passkey/options", "/api/auth/passkey/verify")) {
            val limited = document.get("paths").get(path).get("post").get("responses").get("429")
            assertThat(limited.get("headers").has("Retry-After")).isTrue()
        }
        assertThat(document.get("paths").propertyNames()).containsExactlyInAnyOrder(
            "/api/me/activities", "/api/activities/{activityId}/my-invitations", "/api/invitations/{invitationId}/respond",
            "/api/auth/session", "/api/auth/login", "/api/auth/logout", "/api/auth/passkey/options", "/api/auth/passkey/verify")
        val update = document.get("paths").get("/api/invitations/{invitationId}/respond").get("put")
        assertThat(update.get("requestBody").get("content").get("application/json").get("schema").get("\$ref").asString())
            .isEqualTo("#/components/schemas/RespondToInvitationRequest")
        assertThat(update.get("responses").get("200").get("content").get("application/json").get("schema").get("\$ref").asString())
            .isEqualTo("#/components/schemas/InvitationResponseResult")
        val schemas = document.get("components").get("schemas")
        assertThat(schemas.has("ApiError")).isTrue()
        assertThat(schemas.get("RespondToInvitationRequest").get("properties").propertyNames())
            .containsExactlyInAnyOrder("response", "comment")
        assertThat(document.toString()).doesNotContain("session_id", "Jwt", issuer)
        assertThat(schemas.get("RespondToInvitationRequest").get("required").toString()).contains("response")
        assertThat(schemas.get("AccessibleInvitation").get("required").toString()).contains("response_comment")
        assertThat(schemas.get("AccessibleInvitation").get("properties").get("response_comment").get("type").toString()).contains("null")
        assertThat(schemas.get("RespondToInvitationRequest").get("properties").get("response").get("enum").toString())
            .contains("pending", "accepted", "declined")
        for (code in listOf("400", "401", "403", "409")) {
            assertThat(update.get("responses").get(code).get("content").get("application/json").get("schema").get("\$ref").asString())
                .isEqualTo("#/components/schemas/ApiError")
        }
        assertThat(json.readTree(respond("{}", bearer="invalid").body()).get("error").asString()).isEqualTo("Inloggning krävs.")
        assertThat(json.readTree(respond("{}").body()).get("error").asString()).isEqualTo("Ogiltigt kallelsesvar.")
        Files.writeString(Path.of("target/openapi.json"), result.body())
    }
}
