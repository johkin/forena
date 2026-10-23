package se.forena.api

import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.file.Files
import java.nio.file.Path
import java.sql.DriverManager
import java.sql.Timestamp
import java.time.Duration
import java.time.Instant
import java.util.Base64
import java.util.UUID
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit.SECONDS
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.awaitility.Awaitility.await
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.Mockito.clearInvocations
import org.mockito.Mockito.verifyNoInteractions
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.core.env.Environment
import org.springframework.dao.DataAccessException
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import org.testcontainers.postgresql.PostgreSQLContainer
import se.forena.api.activities.internal.InvitationHistoryRepository
import se.forena.api.activities.internal.InvitationRepository
import se.forena.api.identity.BrowserLoginLimiter
import se.forena.api.identity.BrowserSessionSettings
import tools.jackson.databind.json.JsonMapper

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ApiTest {
    companion object {
        val database = PostgreSQLContainer("postgres:17.6-alpine").withInitScript("init.sql").also { it.start() }
        @JvmStatic @DynamicPropertySource
        fun properties(registry: DynamicPropertyRegistry) {
            registry.add("spring.datasource.url") { database.jdbcUrl }
            registry.add("spring.datasource.username") { "forena_api_runtime" }
            registry.add("spring.datasource.password") { "local-runtime-only" }
            registry.add("spring.datasource.hikari.maximum-pool-size") { 4 }
            registry.add("spring.liquibase.enabled") { true }
            registry.add("spring.liquibase.user") { "forena_api_owner" }
            registry.add("spring.liquibase.password") { "local-owner-only" }
            registry.add("forena.email.resend-api-key") { "synthetic-unused-key" }
            registry.add("forena.email.from") { "auth@example.invalid" }
            registry.add("forena.web-session.enabled") { true }
            registry.add("forena.web-session.origin") { "https://app.example.invalid" }
            registry.add("forena.web-session.key") { Base64.getEncoder().encodeToString(ByteArray(32) { 7 }) }
        }
    }
    @Autowired lateinit var passwords: PasswordEncoder
    @Autowired lateinit var environment: Environment
    @Autowired lateinit var jdbc: JdbcTemplate
    @Autowired lateinit var transactionManager: PlatformTransactionManager
    @MockitoSpyBean lateinit var releaseAccess: DatabaseAccessVerifier
    @MockitoSpyBean lateinit var historyRecords: InvitationHistoryRepository
    @Autowired lateinit var invitationRecords: InvitationRepository
    @Autowired lateinit var json: JsonMapper
    @Autowired lateinit var loginLimiter: BrowserLoginLimiter
    @Autowired lateinit var browserSettings: BrowserSessionSettings
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
        parent = UUID.randomUUID(); outsider = UUID.randomUUID(); session = UUID.randomUUID()
        organization = UUID.randomUUID(); activity = UUID.randomUUID()
        own = UUID.randomUUID(); child1 = UUID.randomUUID(); child2 = UUID.randomUUID(); other = UUID.randomUUID()
        admin.update("insert into forena.account(subject) values(?),(?)", parent, outsider)
        for (subject in listOf(parent, outsider)) {
            admin.update("insert into forena.native_user(subject,email,password_hash,verified) values(?,?,?,true)",
                subject, "$subject@example.invalid", passwords.encode("synthetic-password"))
        }
        cookies.clear()
        loginCookie()
        session = UUID.fromString(admin.queryForObject("select session_id from forena.spring_session where principal_name=?", String::class.java, parent.toString()))
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

    private val cookies = mutableMapOf<UUID, String>()
    private fun loginCookie(subject: UUID = parent): String = cookies.getOrPut(subject) {
        val response = HttpClient.newHttpClient().send(HttpRequest.newBuilder(URI("http://127.0.0.1:${environment.getRequiredProperty("local.server.port")}/api/auth/login"))
            .header("Origin", browserSettings.origin).header("X-Forena-Request", "1")
            .header("Content-Type", "application/x-www-form-urlencoded")
            .POST(HttpRequest.BodyPublishers.ofString("email=$subject%40example.invalid&password=synthetic-password")).build(), HttpResponse.BodyHandlers.ofString())
        assertThat(response.statusCode()).isEqualTo(200)
        response.headers().allValues("set-cookie").single { it.startsWith(browserSettings.cookieName + "=") }.substringBefore(';')
    }
    private fun request(path: String, body: String? = null, cookie: String? = loginCookie()): HttpResponse<String> {
        val request = HttpRequest.newBuilder(URI("http://127.0.0.1:${environment.getRequiredProperty("local.server.port")}$path"))
            .header("Origin", browserSettings.origin).header("X-Forena-Request", "1").header("X-Forena-Account", (cookies.entries.find { it.value == cookie }?.key ?: parent).toString())
        cookie?.let { request.header("Cookie", it) }
        if (body == null) request.GET() else request.header("Content-Type", "application/json").PUT(HttpRequest.BodyPublishers.ofString(body))
        return HttpClient.newHttpClient().send(request.build(), HttpResponse.BodyHandlers.ofString())
    }
    private fun respond(body: String, cookie: String = loginCookie()) = request("/api/invitations/$invitation/respond", body, cookie)
    private fun row() = admin.queryForMap("select * from forena.invitation where id=?", invitation)
    private fun history() = admin.queryForObject("select count(*) from forena.invitation_history where invitation_id=?", Long::class.java, invitation)!!
    private fun dirty() = admin.queryForObject("select coalesce((select dirty_revision from forena.activity_signal_state where activity_id=?),0)", Long::class.java, activity)!!

    @Test fun `logout committed during activity lock wait rejects the pending write`() {
        DriverManager.getConnection(database.jdbcUrl, database.username, database.password).use { connection ->
            connection.autoCommit = false
            connection.prepareStatement("select id from forena.activity where id=? for update").use {
                it.setObject(1,activity); it.executeQuery().close()
            }
            val result = CompletableFuture.supplyAsync { respond("""{"response":"accepted"}""") }
            try {
                await().atMost(Duration.ofSeconds(10)).until {
                    admin.queryForObject("select count(*) from pg_stat_activity where usename='forena_api_runtime' and wait_event_type='Lock'",Long::class.java)!! > 0
                }
                admin.update("insert into forena.revoked_session(id,subject) values(?,?)", session, parent)
            } finally { connection.rollback() }
            assertThat(result.get(10,SECONDS).statusCode()).isEqualTo(401)
            assertThat(row()["revision"]).isEqualTo(0L)
            assertThat(history()).isZero(); assertThat(dirty()).isZero()
        }
    }

    @Test fun `personal overview serializes invitation-only teams and empty access lists`() {
        val response = request("/api/me/overview")
        assertThat(response.statusCode()).isEqualTo(200)
        val overview = json.readTree(response.body())
        assertThat(overview.get("activities").size()).isEqualTo(1)
        assertThat(overview.get("activities").get(0).get("team").get("roles").isArray).isTrue()
        assertThat(overview.get("activities").get(0).get("team").get("roles").size()).isZero()
        assertThat(overview.get("teams").size()).isZero()
        assertThat(json.readTree(request("/api/activities/$activity").body()).get("team").get("roles").size()).isZero()
        admin.update("update forena.activity set invitation_send_at=now()+interval '1 hour' where id=?", activity)
        val unsent = request("/api/activities/$activity/my-invitations")
        assertThat(unsent.statusCode()).isEqualTo(200)
        assertThat(json.readTree(unsent.body()).get("invitations").size()).isZero()
        admin.update("update forena.person_access set active=false where subject=?", parent)
        val empty = request("/api/me/overview")
        assertThat(empty.statusCode()).isEqualTo(200)
        val emptyOverview = json.readTree(empty.body())
        for (field in listOf("activities", "organizations", "teams")) {
            assertThat(emptyOverview.get(field).isArray).isTrue()
            assertThat(emptyOverview.get(field).size()).isZero()
        }
        assertThat(json.readTree(request("/api/me/activities").body()).get("activities").size()).isZero()
        assertThat(request("/api/activities/$activity/my-invitations").statusCode()).isEqualTo(404)
    }

    @Test fun `personal overview includes dated member rows without invitations using organization local date`() {
        admin.update("delete from forena.invitation where activity_id=?", activity)
        admin.update("update forena.organization set time_zone='America/Los_Angeles' where id=?", organization)
        admin.update("update forena.activity set starts_at='2030-01-01T00:30:00Z', ends_at='2030-01-01T02:00:00Z', location='Örvallen' where id=?", activity)
        val team = admin.queryForObject("select team_id from forena.activity where id=?", UUID::class.java, activity)!!
        for (person in listOf(own, child1)) admin.update("insert into forena.team_membership(organization_id,team_id,person_id,role,starts_on,ends_on) values(?,?,?,'participant','2029-12-31','2029-12-31')", organization, team, person)
        // UTC January 1 is still December 31 at the club; inclusive membership dates must match it.
        val result = request("/api/me/overview")
        assertThat(result.statusCode()).isEqualTo(200)
        assertThat(result.headers().firstValue("cache-control").orElse("")).contains("no-store")
        val rows = json.readTree(result.body()).get("activities")
        assertThat(rows.size()).isEqualTo(1)
        assertThat(rows.get(0).get("location").asString()).isEqualTo("Örvallen")
        assertThat(rows.get(0).get("people").size()).isEqualTo(2)
        assertThat(rows.get(0).get("people").get(0).get("invitation").isNull).isTrue()
        assertThat(request("/api/activities/$activity").statusCode()).isEqualTo(200)
        admin.update("update forena.team_membership set ends_on='2029-12-30', starts_on='2029-12-30' where team_id=?", team)
        assertThat(json.readTree(request("/api/me/overview").body()).get("activities").size()).isZero()
        assertThat(request("/api/activities/$activity").statusCode()).isEqualTo(404)
    }

    @Test fun `own team access reads metadata but never another persons invitation or delegated team access`() {
        val otherInvitation = admin.queryForObject("select id from forena.invitation where activity_id=? and person_id=?", UUID::class.java, activity, other)!!
        admin.update("delete from forena.invitation where activity_id=? and person_id<>?", activity, other)
        val team = admin.queryForObject("select team_id from forena.activity where id=?", UUID::class.java, activity)!!
        admin.update("insert into forena.team_access_assignment(organization_id,team_id,person_id,starts_on) values(?,?,?,current_date-1)", organization, team, child1)
        assertThat(request("/api/activities/$activity").statusCode()).isEqualTo(404)
        admin.update("insert into forena.team_access_assignment(organization_id,team_id,person_id,starts_on) values(?,?,?,current_date-1)", organization, team, own)
        val row = json.readTree(request("/api/activities/$activity").body())
        assertThat(row.get("people").size()).isEqualTo(1)
        assertThat(row.get("people").get(0).get("id").asString()).isEqualTo(own.toString())
        assertThat(row.get("people").get(0).get("invitation").isNull).isTrue()
        assertThat(request("/api/invitations/$otherInvitation/respond", """{"response":"accepted"}""").statusCode()).isEqualTo(403)
        admin.update("update forena.team_access_assignment set active=false where person_id=?", own)
        assertThat(request("/api/activities/$activity").statusCode()).isEqualTo(404)
    }

    @Test fun `personal overview is complete beyond fifty rows and ninety days and hides future invitations`() {
        val team = admin.queryForObject("select team_id from forena.activity where id=?", UUID::class.java, activity)!!
        repeat(55) { index ->
            val event = UUID.randomUUID()
            admin.update("insert into forena.activity(id,organization_id,team_id,title,starts_at,ends_at,invitation_send_at) values(?,?,?,'Senare aktivitet',now()+interval '200 days'+?*interval '1 hour',now()+interval '200 days'+?*interval '1 hour'+interval '1 hour',now()+interval '100 days')", event, organization, team, index, index)
            admin.update("insert into forena.invitation(id,organization_id,activity_id,person_id) values(?,?,?,?)", UUID.randomUUID(), organization, event, own)
        }
        val overview = json.readTree(request("/api/me/overview").body())
        assertThat(overview.get("activities").size()).isEqualTo(56)
        assertThat(overview.get("activities").get(55).get("people").size()).isEqualTo(1)
        assertThat(overview.get("activities").get(55).get("people").get(0).get("invitation").isNull).isTrue()
        admin.update("update forena.person_access set active=false where subject=?", parent)
        assertThat(json.readTree(request("/api/me/overview").body()).get("activities").size()).isZero()
    }

    @Test fun `personal workspaces show current roles without widening personal invitation access`() {
        val team = admin.queryForObject("select team_id from forena.activity where id=?", UUID::class.java, activity)!!
        for (person in listOf(own, child1)) admin.update("insert into forena.team_membership(organization_id,team_id,person_id,role,starts_on) values(?,?,?,'leader',current_date-1)", organization, team, person)
        admin.update("insert into forena.organization_member(organization_id,subject,role) values(?,?,'owner')", organization, parent)
        val adminOnlyOrganization = UUID.randomUUID()
        admin.update("insert into forena.organization(id,name) values(?,'AIK')", adminOnlyOrganization)
        admin.update("insert into forena.organization_member(organization_id,subject,role) values(?,?,'admin')", adminOnlyOrganization, parent)
        val overview = json.readTree(request("/api/me/overview").body())
        assertThat(overview.get("organizations").size()).isEqualTo(2)
        assertThat(overview.get("organizations").single { it.get("id").asString() == organization.toString() }.get("role").asString()).isEqualTo("owner")
        assertThat(overview.get("organizations").single { it.get("id").asString() == adminOnlyOrganization.toString() }.get("role").asString()).isEqualTo("admin")
        assertThat(overview.get("teams").size()).isEqualTo(1)
        assertThat(overview.get("teams").get(0).get("roles").toString()).contains("leader", "guardian")
        assertThat(overview.get("activities").get(0).get("people").size()).isEqualTo(3)
        admin.update("update forena.organization_member set active=false where subject=?", parent)
        admin.update("update forena.team_membership set active=false where team_id=?", team)
        val revoked = json.readTree(request("/api/me/overview").body())
        assertThat(revoked.get("teams").size()).isZero()
        assertThat(revoked.get("organizations").get(0).get("role").isNull).isTrue()
        admin.update("update forena.account set enabled=false where subject=?", parent)
        assertThat(request("/api/me/overview").statusCode()).isEqualTo(401)
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
                id, organization, team, "Aktivitet $index", Timestamp.from(starts), Timestamp.from(starts.plusSeconds(3600)))
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
        assertThat(respond("""{"response":"accepted"}""",loginCookie(outsider)).statusCode()).isEqualTo(403)
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
            val result = CompletableFuture.supplyAsync { respond("""{"response":"accepted"}""", loginCookie(outsider)) }
            assertThat(result.get(5,SECONDS).statusCode()).isEqualTo(403)
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
        val cookie = loginCookie()
        val results = (1..6).map { CompletableFuture.supplyAsync { respond("""{"response":"accepted"}""", cookie).statusCode() } }
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
        assertThat(respond("""{"response":"accepted"}""", loginCookie(outsider)).statusCode()).isEqualTo(403)
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

    @Test fun `release verification rejects missing grants while health only checks database connectivity`() {
        releaseAccess.verify()
        admin.execute("revoke insert on forena.team from forena_api_runtime")
        try {
            assertThatThrownBy { releaseAccess.verify() }.isInstanceOf(IllegalStateException::class.java)
            clearInvocations(releaseAccess)
            repeat(3) {
                val health = request("/actuator/health", cookie=null)
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
            assertThat(respond("""{"response":"accepted"}""", loginCookie(outsider)).statusCode()).isEqualTo(403)
            assertThat(respond("""{"response":"accepted"}""").statusCode()).isEqualTo(200)
            val ownList = request("/api/activities/$activity/my-invitations", cookie=loginCookie(outsider))
            assertThat(ownList.statusCode()).isEqualTo(200)
            assertThat(ownList.body()).contains(other.toString()).doesNotContain(child1.toString(),own.toString())
        }
        for (sql in listOf("create table forena.forbidden(id int)", "alter table forena.team add column forbidden text",
            "drop table forena.team", "truncate forena.team", "select * from forena.databasechangelog",
            "update forena.databasechangeloglock set locked=true", "set role forena_api_owner")) {
            assertThatThrownBy { jdbc.execute(sql) }.describedAs(sql).isInstanceOf(DataAccessException::class.java)
        }
    }

    @Test fun `Kotlin lifecycle check waits for a concurrent cancellation`() {
        DriverManager.getConnection(database.jdbcUrl, database.username, database.password).use { connection ->
            connection.autoCommit = false
            connection.prepareStatement("update forena.activity set status='cancelled' where id=?").use { it.setObject(1,activity); it.executeUpdate() }
            val result = CompletableFuture.supplyAsync { respond("""{"response":"accepted"}""") }
            await().atMost(Duration.ofSeconds(5)).until {
                admin.queryForObject("select exists(select 1 from pg_stat_activity where usename='forena_api_runtime' and wait_event_type='Lock')", Boolean::class.java) == true
            }
            connection.commit()
            assertThat(result.get().statusCode()).isEqualTo(409)
        }
        assertThat(history()).isZero(); assertThat(dirty()).isZero()
    }

    private fun awaitRuntimeLocks(count: Long) {
        await().atMost(Duration.ofSeconds(5)).until {
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
            await().atMost(Duration.ofSeconds(5)).until {
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
        assertThat(request("/api/activities/$foreignActivity").statusCode()).isEqualTo(404)
        assertThat(request("/api/me/overview").body()).doesNotContain(foreignActivity.toString(), foreignPerson.toString(), "Privat aktivitet")
        assertThat(request("/api/invitations/$foreignInvitation/respond", """{"response":"accepted"}""").statusCode()).isEqualTo(403)
        assertThatThrownBy { admin.update("insert into forena.invitation(id,organization_id,activity_id,person_id) values(?,?,?,?)",UUID.randomUUID(),organization,activity,foreignPerson) }
            .isInstanceOf(DataIntegrityViolationException::class.java)
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
        assertThat(respond("""{"response":"accepted"}""", loginCookie(outsider)).statusCode()).isEqualTo(200)
        admin.update("update forena.person_access set active=false where person_id=? and subject=?",child1,outsider)
        assertThat(respond("""{"response":"declined"}""", loginCookie(outsider)).statusCode()).isEqualTo(403)
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
        assertThat(request("/v3/api-docs", cookie=null).statusCode()).isEqualTo(401)
        val result = request("/v3/api-docs")
        assertThat(result.statusCode()).isEqualTo(200)
        val document = json.readTree(result.body())
        val update = document.get("paths").get("/api/invitations/{invitationId}/respond").get("put")
        assertThat(update.get("requestBody").get("content").get("application/json").get("schema").get("\$ref").asString())
            .isEqualTo("#/components/schemas/RespondToInvitationRequest")
        assertThat(update.get("responses").get("200").get("content").get("application/json").get("schema").get("\$ref").asString())
            .isEqualTo("#/components/schemas/InvitationResponseResult")
        val schemas = document.get("components").get("schemas")
        assertThat(schemas.has("ApiError")).isTrue()
        assertThat(schemas.get("RespondToInvitationRequest").get("properties").propertyNames())
            .containsExactlyInAnyOrder("response", "comment")
        assertThat(document.toString()).doesNotContain("session_id", "Jwt")
        assertThat(schemas.get("RespondToInvitationRequest").get("required").toString()).contains("response")
        assertThat(schemas.get("AccessibleInvitation").get("required").toString()).contains("response_comment")
        assertThat(schemas.get("AccessibleInvitation").get("properties").get("response_comment").get("type").toString()).contains("null")
        assertThat(schemas.get("RespondToInvitationRequest").get("properties").get("response").get("enum").toString())
            .contains("pending", "accepted", "declined")
        for (code in listOf("400", "401", "403", "409")) {
            assertThat(update.get("responses").get(code).get("content").get("application/json").get("schema").get("\$ref").asString())
                .isEqualTo("#/components/schemas/ApiError")
        }
        assertThat(json.readTree(respond("{}", cookie="invalid").body()).get("error").asString()).isEqualTo("Inloggning krävs.")
        assertThat(json.readTree(respond("{}").body()).get("error").asString()).isEqualTo("Ogiltigt kallelsesvar.")
        Files.writeString(Path.of("target/openapi.json"), result.body())
    }
}
