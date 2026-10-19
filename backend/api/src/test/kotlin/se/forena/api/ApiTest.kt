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
        val jwks = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0).also { server ->
            server.createContext("/jwks") { exchange ->
                val bytes = JWKSet(listOf(key.toPublicJWK(), ecKey.toPublicJWK())).toString().toByteArray()
                exchange.responseHeaders.add("Content-Type", "application/json")
                exchange.sendResponseHeaders(if (jwksAvailable) 200 else 503, bytes.size.toLong())
                exchange.responseBody.use { it.write(bytes) }
            }
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
            registry.add("forena.auth.issuer") { issuer }
            registry.add("forena.auth.jwks-uri") { "http://127.0.0.1:${jwks.address.port}/jwks" }
        }
    }
    @Autowired lateinit var environment: Environment
    @Autowired lateinit var jdbc: JdbcTemplate
    @Autowired lateinit var transactionManager: PlatformTransactionManager
    @MockitoSpyBean lateinit var historyRecords: InvitationHistoryRepository
    @Autowired lateinit var invitationRecords: InvitationRepository
    @Autowired lateinit var json: JsonMapper
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
        parent = UUID.randomUUID(); outsider = UUID.randomUUID(); session = UUID.randomUUID()
        organization = UUID.randomUUID(); activity = UUID.randomUUID()
        own = UUID.randomUUID(); child1 = UUID.randomUUID(); child2 = UUID.randomUUID(); other = UUID.randomUUID()
        admin.update("insert into forena.account(subject) values(?),(?)", parent, outsider)
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
            "role" to "authenticated", "session_id" to session.toString(), "is_anonymous" to false,
            "iat" to Date.from(Instant.now().minusSeconds(1)), "exp" to Date.from(Instant.now().plusSeconds(300)))
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
            // A cached, already trusted key remains usable during an outage.
            assertThat(request("/api/activities/$activity/my-invitations").statusCode()).isEqualTo(200)
            val unknown = RSAKeyGenerator(2048).keyID(UUID.randomUUID().toString()).generate()
            assertThat(respond("""{"response":"accepted"}""", token(signingKey=unknown)).statusCode()).isEqualTo(401)
        } finally { jwksAvailable = true }
    }

    @Test fun `runtime grants stay limited and Kotlin authorization survives rollback and connection reuse`() {
        assertThat(jdbc.queryForObject("select rolsuper or rolbypassrls from pg_roles where rolname=current_user", Boolean::class.java)).isFalse()
        assertThat(jdbc.queryForObject("select pg_has_role(current_user,'forena_api_owner','MEMBER')", Boolean::class.java)).isFalse()
        assertThat(jdbc.queryForObject("select has_schema_privilege(current_user,'forena','CREATE')", Boolean::class.java)).isFalse()
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
        for (sql in listOf("create table forena.forbidden(id int)", "update forena.invitation set person_id='$other' where id='$invitation'",
            "delete from forena.invitation", "update forena.invitation_history set channel='web'", "delete from forena.invitation_history", "delete from forena.activity_signal_state", "select * from forena.team")) {
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
        assertThat(document.get("paths").propertyNames()).containsExactlyInAnyOrder(
            "/api/activities/{activityId}/my-invitations", "/api/invitations/{invitationId}/respond")
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
        assertThat(schemas.get("FamilyInvitation").get("required").toString()).contains("response_comment")
        assertThat(schemas.get("FamilyInvitation").get("properties").get("response_comment").get("type").toString()).contains("null")
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
