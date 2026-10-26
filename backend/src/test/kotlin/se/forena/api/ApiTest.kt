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
import org.assertj.core.api.Assertions.assertThatCode
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.awaitility.Awaitility.await
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable
import org.mockito.Mockito.never
import org.mockito.Mockito.verify
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
import se.forena.api.administration.internal.ClubRepository
import se.forena.api.activities.internal.ManagementRepository
import se.forena.api.activities.internal.InvitationRepository
import se.forena.api.identity.BrowserLoginLimiter
import se.forena.api.identity.BrowserSessionSettings
import tools.jackson.databind.json.JsonMapper

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ApiTest {
    @Test fun `disabled notification worker rejects even an authenticated browser session`() {
        val base = "http://127.0.0.1:${environment.getRequiredProperty("local.server.port")}/internal/notifications"
        for (path in listOf("status", "run")) {
            val request = HttpRequest.newBuilder(URI("$base/$path")).header("Cookie", loginCookie())
            if (path == "run") request.POST(HttpRequest.BodyPublishers.noBody())
            val response = HttpClient.newHttpClient().send(request.build(), HttpResponse.BodyHandlers.ofString())
            assertThat(response.statusCode()).isEqualTo(401)
        }
    }

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
            registry.add("forena.administration.initial-system-admin-email") { "bootstrap@example.invalid" }
            registry.add("forena.email.from") { "auth@example.invalid" }
            registry.add("forena.web-session.enabled") { true }
            registry.add("forena.web-session.origin") { "https://app.example.invalid" }
            registry.add("forena.web-session.key") { Base64.getEncoder().encodeToString(ByteArray(32) { 7 }) }
        }
    }
    @MockitoSpyBean lateinit var clubRecords: ClubRepository
    @Autowired lateinit var managementRecords: ManagementRepository
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
        admin.update("delete from forena.platform_administrator")
        admin.update("update forena.administration_state set initialized=false")
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
    private fun request(path: String, body: String? = null, cookie: String? = loginCookie(), method: String = if (body == null) "GET" else "PUT"): HttpResponse<String> {
        val request = HttpRequest.newBuilder(URI("http://127.0.0.1:${environment.getRequiredProperty("local.server.port")}$path"))
            .header("Origin", browserSettings.origin).header("X-Forena-Request", "1").header("X-Forena-Account", (cookies.entries.find { it.value == cookie }?.key ?: parent).toString())
        cookie?.let { request.header("Cookie", it) }
        request.header("Content-Type", "application/json").method(method, if (body == null) HttpRequest.BodyPublishers.noBody() else HttpRequest.BodyPublishers.ofString(body))
        return HttpClient.newHttpClient().send(request.build(), HttpResponse.BodyHandlers.ofString())
    }
    private fun respond(body: String, cookie: String = loginCookie()) = request("/api/invitations/$invitation/respond", body, cookie)
    private fun row() = admin.queryForMap("select * from forena.invitation where id=?", invitation)
    private fun history() = admin.queryForObject("select count(*) from forena.invitation_history where invitation_id=?", Long::class.java, invitation)!!
    private fun dirty() = admin.queryForObject("select coalesce((select dirty_revision from forena.activity_signal_state where activity_id=?),0)", Long::class.java, activity)!!

    private fun rosterTeam(): UUID = admin.queryForObject("select team_id from forena.activity where id=?", UUID::class.java, activity)!!
    private fun rosterMember(person: UUID, role: String = "participant", start: String = "current_date", end: String = "null") {
        admin.update("insert into forena.team_membership(organization_id,team_id,person_id,role,starts_on,ends_on) values(?,?,?,?, $start, $end)", organization, rosterTeam(), person, role)
    }
    private fun rosterPermission(person: UUID = own, permission: String = "roster.manage") {
        admin.update("insert into forena.team_permission_assignment(organization_id,team_id,person_id,permission,starts_on) values(?,?,?,?,current_date)", organization, rosterTeam(), person, permission)
    }

    @Test fun `roster permission is independent of membership activity rights and delegated identity`() {
        val path = "/api/teams/${rosterTeam()}/roster"
        rosterMember(own, "leader")
        rosterMember(child1)
        rosterPermission(own, "activity.manage")
        rosterPermission(child1)
        assertThat(request("$path/access").body()).isEqualTo("false")
        assertThat(request(path).statusCode()).isEqualTo(403)
        assertThat(request("$path/members/$child1", """{"name":"Nytt namn"}""").statusCode()).isEqualTo(403)
        assertThat(request("$path/groups", """{"name":"Gul"}""", method = "POST").statusCode()).isEqualTo(403)
        rosterPermission()
        assertThat(request("$path/access").body()).isEqualTo("true")
        assertThat(request(path).statusCode()).isEqualTo(200)
        assertThat(request(path, cookie = loginCookie(outsider)).statusCode()).isEqualTo(403)
        admin.update("update forena.team_permission_assignment set ends_on=current_date-1,starts_on=current_date-2 where person_id=? and permission='roster.manage'", own)
        assertThat(request(path).statusCode()).isEqualTo(403)
    }

    @Test fun `roster snapshot includes current roles responsibilities guardians and only children in this team`() {
        rosterPermission()
        rosterMember(own, "leader")
        rosterMember(own)
        rosterMember(child1)
        rosterMember(other, "volunteer")
        rosterMember(child2, start = "(current_timestamp at time zone 'Europe/Stockholm')::date+1")
        val responsibility = UUID.randomUUID()
        admin.update("insert into forena.team_audience_group(id,organization_id,team_id,name,kind) values(?,?,?,'Tränare','responsibility')", responsibility, organization, rosterTeam())
        admin.update("insert into forena.team_audience_member(group_id,organization_id,person_id) values(?,?,?)", responsibility, organization, own)
        admin.update("update forena.person_access set contact_name='Registrerad målsman',contact_phone='+46701234567' where person_id=? and kind='guardian'", child1)
        val response = request("/api/teams/${rosterTeam()}/roster")
        assertThat(response.statusCode()).isEqualTo(200)
        assertThat(response.headers().firstValue("Cache-Control").orElse("")).contains("no-store")
        val snapshot = json.readTree(response.body())
        val people = snapshot.get("people").toList()
        assertThat(people.map { it.get("id").asString() }).containsExactlyInAnyOrder(own.toString(), child1.toString(), other.toString())
        val leader = people.single { it.get("id").asString() == own.toString() }
        assertThat(leader.get("roles").toString()).contains("leader", "participant")
        assertThat(leader.get("title").asString()).isEqualTo("Tränare")
        assertThat(leader.get("childIds").toString()).contains(child1.toString()).doesNotContain(child2.toString())
        val child = people.single { it.get("id").asString() == child1.toString() }
        assertThat(child.get("guardians").toString()).contains("Registrerad målsman", "+46701234567")
        assertThat(snapshot.get("groups").isEmpty).isTrue()
    }

    @Test fun `roster rename changes only current member name and records actor`() {
        rosterPermission()
        rosterMember(own, "leader")
        rosterMember(child1, start = "current_date-2", end = "current_date-1")
        val path = "/api/teams/${rosterTeam()}/roster/members"
        assertThat(request("$path/$child1", """{"name":"Saknar medlemskap"}""").statusCode()).isEqualTo(404)
        assertThat(request("$path/$other", """{"name":"Annat lag"}""").statusCode()).isEqualTo(404)
        assertThat(request("$path/$own", """{"name":"   "}""").statusCode()).isEqualTo(400)
        assertThat(request("$path/$own", """{"name":" Robin Nytt namn "}""").statusCode()).isEqualTo(204)
        assertThat(admin.queryForObject("select display_name from forena.person where id=?", String::class.java, own)).isEqualTo("Robin Nytt namn")
        assertThat(admin.queryForObject("select role from forena.team_membership where person_id=?", String::class.java, own)).isEqualTo("leader")
        assertThat(admin.queryForObject("select actor_subject from forena.roster_audit where team_id=? and operation='member.updated'", UUID::class.java, rosterTeam())).isEqualTo(parent)
    }

    @Test fun `roster groups validate selections atomically reject stale updates and delete only the group`() {
        rosterPermission()
        rosterMember(own, "leader")
        rosterMember(child1)
        val base = "/api/teams/${rosterTeam()}/roster/groups"
        val created = request(base, """{"name":"Lag Gul","personIds":["$child1","$child1"]}""", method = "POST")
        assertThat(created.statusCode()).isEqualTo(201)
        val id = json.readTree(created.body()).get("id").asString()
        assertThat(request(base, """{"name":" lag gul "}""", method = "POST").statusCode()).isEqualTo(409)
        assertThat(request("$base/$id", """{"name":"Fel urval","personIds":["$child2"],"revision":0}""").statusCode()).isEqualTo(400)
        assertThat(admin.queryForObject("select name from forena.team_audience_group where id=?::uuid", String::class.java, id)).isEqualTo("Lag Gul")
        assertThat(admin.queryForObject("select person_id from forena.team_audience_member where group_id=?::uuid", UUID::class.java, id)).isEqualTo(child1)
        assertThat(request("$base/$id", """{"name":"Lag Blå","personIds":["$own"],"revision":0}""").statusCode()).isEqualTo(204)
        assertThat(request("$base/$id", """{"name":"Gammalt utkast","personIds":[],"revision":0}""").statusCode()).isEqualTo(409)
        assertThat(request("$base/$id?revision=0", method = "DELETE").statusCode()).isEqualTo(409)
        assertThat(admin.queryForObject("select person_id from forena.team_audience_member where group_id=?::uuid", UUID::class.java, id)).isEqualTo(own)
        val responsibility = UUID.randomUUID()
        admin.update("insert into forena.team_audience_group(id,organization_id,team_id,name,kind) values(?,?,?,'Ansvar','responsibility')", responsibility, organization, rosterTeam())
        assertThat(request("$base/$responsibility", """{"name":"Får inte ändras","revision":0}""").statusCode()).isEqualTo(409)
        assertThat(request("$base/$responsibility?revision=0", method = "DELETE").statusCode()).isEqualTo(404)
        assertThat(request("$base/$id?revision=1", method = "DELETE").statusCode()).isEqualTo(204)
        assertThat(admin.queryForObject("select count(*) from forena.team_membership where team_id=?", Long::class.java, rosterTeam())).isEqualTo(2)
        assertThat(admin.queryForObject("select count(*) from forena.team_audience_member where group_id=?::uuid", Long::class.java, id)).isZero()
        assertThat(admin.queryForObject("select count(*) from forena.roster_audit where team_id=?", Long::class.java, rosterTeam())).isEqualTo(3)
    }

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


    @Test fun `calendar reads exactly one Stockholm month with historical membership and independent attendance`() {
        admin.update("delete from forena.invitation where activity_id=?", activity)
        admin.update("update forena.activity set starts_at='2026-10-12T15:00:00Z',ends_at='2026-10-12T16:00:00Z' where id=?", activity)
        val team = rosterTeam()
        for (person in listOf(child1, child2)) admin.update("insert into forena.team_membership(organization_id,team_id,person_id,role,starts_on,ends_on) values(?,?,?,'participant','2026-10-01','2026-10-20')", organization, team, person)
        admin.update("insert into forena.attendance_report values(?,?,?,now())", activity, organization, parent)
        admin.update("insert into forena.attendance_record values(?,?,?)", activity, organization, child1)
        val response = request("/api/me/calendar?month=2026-10")
        assertThat(response.statusCode()).isEqualTo(200)
        assertThat(response.headers().firstValue("cache-control").orElse("")).contains("no-store")
        val calendar = json.readTree(response.body())
        assertThat(calendar.get("activities").size()).isEqualTo(1)
        val people = calendar.get("activities").get(0).get("people")
        assertThat(people.single { it.get("id").asString() == child1.toString() }.get("attendance").asString()).isEqualTo("present")
        assertThat(people.single { it.get("id").asString() == child2.toString() }.get("attendance").asString()).isEqualTo("absent")
        assertThat(people.toString()).doesNotContain(other.toString())
        assertThat(json.readTree(request("/api/me/calendar?month=2026-11").body()).get("activities").size()).isZero()
        assertThat(json.readTree(request("/api/me/overview").body()).get("activities").size()).isZero()
        assertThat(request("/api/me/calendar?month=2026-13").statusCode()).isEqualTo(400)
        assertThat(request("/api/me/calendar?month=2026-10", cookie=null).statusCode()).isEqualTo(401)
        admin.update("update forena.person_access set active=false where subject=?", parent)
        assertThat(json.readTree(request("/api/me/calendar?month=2026-10").body()).get("activities").size()).isZero()
    }

    @Test fun `calendar retains cancellations and unknown attendance and excludes children from leader meetings`() {
        admin.update("delete from forena.invitation where activity_id=?", activity)
        val team = rosterTeam()
        admin.update("update forena.activity set starts_at='2026-10-12T15:00:00Z',ends_at='2026-10-12T16:00:00Z' where id=?", activity)
        for ((person, role) in listOf(own to "leader", child1 to "participant")) admin.update("insert into forena.team_membership(organization_id,team_id,person_id,role,starts_on) values(?,?,?,?, '2020-01-01')", organization, team, person, role)
        val snapshot = json.readTree(request("/api/me/calendar?month=2026-10").body())
        assertThat(snapshot.get("people").single { it.get("id").asString() == own.toString() }.get("isSelf").asBoolean()).isTrue()
        var rows = snapshot.get("activities")
        assertThat(rows.get(0).get("people").size()).isEqualTo(2)
        assertThat(rows.get(0).get("people").all { it.get("attendance").asString() == "unknown" }).isTrue()
        admin.update("update forena.activity set leaders_only=true where id=?", activity)
        rows = json.readTree(request("/api/me/calendar?month=2026-10").body()).get("activities")
        assertThat(rows.get(0).get("people").size()).isEqualTo(1)
        assertThat(rows.get(0).get("people").get(0).get("id").asString()).isEqualTo(own.toString())
        admin.update("update forena.activity set status='cancelled' where id=?", activity)
        assertThat(json.readTree(request("/api/me/calendar?month=2026-10").body()).get("activities").get(0).get("status").asString()).isEqualTo("cancelled")
    }

    @Test fun `deletion is denied after invitations even without replies while unsent events may be deleted or cancelled`() {
        val team = managedTeam()
        assertThat(json.readTree(request("/api/activities/$activity/disposition").body()).get("canDelete").asBoolean()).isFalse()
        assertThat(request("/api/activities/$activity", """{"action":"delete"}""", method="DELETE").statusCode()).isEqualTo(409)
        assertThat(request("/api/activities/$activity", """{"action":"cancel"}""", method="DELETE").statusCode()).isEqualTo(200)
        val created = request("/api/activities", activityBody(team), method="POST")
        val id = json.readTree(created.body()).get("activity").get("id").asString()
        assertThat(json.readTree(request("/api/activities/$id/disposition").body()).get("canDelete").asBoolean()).isTrue()
        assertThat(request("/api/activities/$id", """{"action":"delete"}""", method="DELETE").statusCode()).isEqualTo(200)
        assertThat(request("/api/activities/$id").statusCode()).isEqualTo(404)
        assertThat(request("/api/me/calendar?month=2030-10").body()).doesNotContain(id)
        assertThat(request("/api/teams/$team/activity-editor").body()).doesNotContain(id)
    }

    @Test fun `attendance reporting uses its own team permission and rejects unrelated people`() {
        val team = managedTeam()
        admin.update("update forena.activity set starts_at=now()-interval '2 hours',ends_at=now()-interval '1 hour' where id=?", activity)
        assertThat(request("/api/activities/$activity/attendance", """{"personIds":["$child1"]}""").statusCode()).isEqualTo(200)
        assertThat(request("/api/activities/$activity/attendance", """{"personIds":["${UUID.randomUUID()}"]}""").statusCode()).isEqualTo(400)
        assertThat(request("/api/activities/$activity/attendance", """{"personIds":[]}""", cookie=loginCookie(outsider)).statusCode()).isEqualTo(403)
        val month = java.time.YearMonth.now(java.time.ZoneId.of("Europe/Stockholm"))
        val people = json.readTree(request("/api/me/calendar?month=$month").body()).get("activities").get(0).get("people")
        assertThat(people.single { it.get("id").asString() == child1.toString() }.get("attendance").asString()).isEqualTo("present")
        assertThat(people.single { it.get("id").asString() == child2.toString() }.get("attendance").asString()).isEqualTo("absent")
        assertThat(people.toString()).doesNotContain(other.toString())
    }

    @Test fun `deleted activities never expose invitations before or after the former send time`() {
        managedTeam()
        admin.update("update forena.activity set invitation_send_at=now()+interval '1 day' where id=?", activity)
        val path = "/api/activities/$activity/my-invitations"
        val scheduled = request(path)
        assertThat(scheduled.statusCode()).isEqualTo(200)
        assertThat(json.readTree(scheduled.body()).get("invitations").size()).isZero()
        assertThat(request("/api/activities/$activity", """{"action":"delete"}""", method="DELETE").statusCode()).isEqualTo(200)
        assertThat(request(path).statusCode()).isEqualTo(404)
        // Move the former send time into the past without changing the tombstone.
        admin.update("update forena.activity set invitation_send_at=now()-interval '1 hour' where id=?", activity)
        assertThat(request(path).statusCode()).isEqualTo(404)
        assertThat(request(path, cookie=loginCookie(outsider)).statusCode()).isEqualTo(404)
        assertThat(respond("""{"response":"accepted"}""").statusCode()).isEqualTo(409)
        assertThat(history()).isZero()
    }

    @Test fun `attendance only managers cannot read invitation answers or guests and preserve hidden attendance`() {
        rosterMember(own, start = "current_date-2")
        rosterMember(child1, start = "current_date-2")
        rosterMember(child2, start = "current_date-4", end = "current_date-3")
        rosterPermission(permission = "attendance.manage")
        admin.update("update forena.activity set starts_at=now()-interval '2 hours',ends_at=now()-interval '1 hour' where id=?", activity)
        admin.update("update forena.invitation set response='accepted',responded_at=now() where activity_id=? and person_id=?", activity, child1)
        admin.update("update forena.invitation set response='declined',responded_at=now() where activity_id=? and person_id=?", activity, other)
        val path = "/api/activities/$activity/attendance"
        val limited = request(path)
        assertThat(limited.statusCode()).isEqualTo(200)
        val roster = json.readTree(limited.body()).get("roster").toList()
        assertThat(roster.map { it.get("personId").asString() }).containsExactlyInAnyOrder(own.toString(), child1.toString())
        assertThat(roster.all { it.get("response").isNull }).isTrue()

        rosterPermission(permission = "invitation.manage")
        val full = json.readTree(request(path).body()).get("roster").toList()
        assertThat(full.single { it.get("personId").asString() == child1.toString() }.get("response").asString()).isEqualTo("accepted")
        assertThat(full.single { it.get("personId").asString() == other.toString() }.get("response").asString()).isEqualTo("declined")
        assertThat(request(path, """{"personIds":["$other"]}""").statusCode()).isEqualTo(200)
        admin.update("update forena.team_permission_assignment set active=false where person_id=? and permission='invitation.manage'", own)

        val reported = request(path, """{"personIds":["$child1"]}""")
        assertThat(reported.statusCode()).isEqualTo(200)
        val reportedRoster = json.readTree(reported.body()).get("roster").toList()
        assertThat(reportedRoster.map { it.get("personId").asString() }).containsExactlyInAnyOrder(own.toString(), child1.toString())
        assertThat(reportedRoster.all { it.get("response").isNull }).isTrue()
        assertThat(admin.queryForList("select person_id from forena.attendance_record where activity_id=?", UUID::class.java, activity))
            .containsExactlyInAnyOrder(child1, other)
        assertThat(request(path, """{"personIds":["$other"]}""").statusCode()).isEqualTo(400)
        admin.update("update forena.team_permission_assignment set active=false where person_id=? and permission='attendance.manage'", own)
        assertThat(request(path).statusCode()).isEqualTo(403)
        assertThat(request(path, """{"personIds":[]}""").statusCode()).isEqualTo(403)
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
    @Test fun `deadline blocks participant answers and comments without changing history`() {
        admin.update("update forena.activity set response_due_at=now()-interval '1 minute' where id=?", activity)
        assertThat(respond("""{"response":"accepted","comment":"För sent"}""").statusCode()).isEqualTo(409)
        assertThat(respond("""{"response":"pending"}""").statusCode()).isEqualTo(409)
        assertThat(row()["response"]).isEqualTo("pending")
        assertThat(history()).isZero()
        assertThat(dirty()).isZero()
        val detail = json.readTree(request("/api/activities/$activity").body())
        assertThat(detail.get("can_manage_activities").asBoolean()).isFalse()
    }

    @Test fun `current activity permission bypasses the deadline only for authorized people and the same team`() {
        val team = admin.queryForObject("select team_id from forena.activity where id=?", UUID::class.java, activity)!!
        admin.update("update forena.activity set response_due_at=now()-interval '1 minute' where id=?", activity)
        // Another person's leadership/permission is not inherited through guardianship.
        admin.update("insert into forena.team_permission_assignment(organization_id,team_id,person_id,permission,starts_on) values(?,?,?,'activity.manage',current_date)", organization, team, child1)
        assertThat(respond("""{"response":"accepted"}""").statusCode()).isEqualTo(409)
        val otherTeam = UUID.randomUUID()
        admin.update("insert into forena.team(id,organization_id,name) values(?,?,'Annat lag')", otherTeam, organization)
        admin.update("insert into forena.team_permission_assignment(organization_id,team_id,person_id,permission,starts_on) values(?,?,?,'activity.manage',current_date)", organization, otherTeam, own)
        assertThat(respond("""{"response":"accepted"}""").statusCode()).isEqualTo(409)
        admin.update("insert into forena.team_permission_assignment(organization_id,team_id,person_id,permission,starts_on) values(?,?,?,'activity.manage',current_date)", organization, team, own)
        assertThat(respond("""{"response":"accepted"}""").statusCode()).isEqualTo(200)
        assertThat(json.readTree(request("/api/activities/$activity").body()).get("can_manage_activities").asBoolean()).isTrue()
        val foreign = admin.queryForObject("select id from forena.invitation where activity_id=? and person_id=?", UUID::class.java, activity, other)!!
        assertThat(request("/api/invitations/$foreign/respond", """{"response":"accepted"}""").statusCode()).isEqualTo(403)
        admin.update("update forena.team_permission_assignment set active=false where person_id=?", own)
        assertThat(respond("""{"response":"declined"}""").statusCode()).isEqualTo(409)
        assertThat(row()["response"]).isEqualTo("accepted")
        assertThat(json.readTree(request("/api/activities/$activity").body()).get("can_manage_activities").asBoolean()).isFalse()
    }

    @Test fun `deadline exception rechecks permission after waiting for the activity lock`() {
        val team = admin.queryForObject("select team_id from forena.activity where id=?", UUID::class.java, activity)!!
        admin.update("insert into forena.team_permission_assignment(organization_id,team_id,person_id,permission,starts_on) values(?,?,?,'activity.manage',current_date)", organization, team, own)
        admin.update("update forena.activity set response_due_at=now()-interval '1 minute' where id=?", activity)
        DriverManager.getConnection(database.jdbcUrl, database.username, database.password).use { connection ->
            connection.autoCommit = false
            connection.prepareStatement("select id from forena.activity where id=? for update").use {
                it.setObject(1, activity); it.executeQuery().close()
            }
            val result = CompletableFuture.supplyAsync { respond("""{"response":"accepted"}""") }
            awaitRuntimeLocks(1)
            admin.update("update forena.team_permission_assignment set active=false where person_id=?", own)
            connection.commit()
            assertThat(result.get(5, SECONDS).statusCode()).isEqualTo(409)
        }
        assertThat(history()).isZero()
        assertThat(dirty()).isZero()
    }

    @Test fun `management never bypasses cancellation or activity end`() {
        managedTeam()
        admin.update("update forena.activity set response_due_at=now()-interval '1 minute',status='cancelled' where id=?", activity)
        assertThat(respond("""{"response":"accepted"}""").statusCode()).isEqualTo(409)
        admin.update("update forena.activity set status='scheduled',response_due_at=now()-interval '3 hours',starts_at=now()-interval '2 hours',ends_at=now()-interval '1 hour' where id=?", activity)
        assertThat(respond("""{"response":"accepted"}""").statusCode()).isEqualTo(409)
        assertThat(history()).isZero()
    }

    private fun managedTeam(): UUID {
        val team = admin.queryForObject("select team_id from forena.activity where id=?", UUID::class.java, activity)!!
        admin.update("insert into forena.organization_member(organization_id,subject,role) values(?,?,'admin')", organization, parent)
        admin.update("insert into forena.team_membership(organization_id,team_id,person_id,role,starts_on) values(?,?,?,'participant',current_date)", organization, team, own)
        return team
    }

    private fun activityBody(team: UUID, extra: String = ""): String =
        """{"teamId":"$team","title":"Ny aktivitet","location":"Planen","startsAt":"2030-10-25T16:00:00Z","endsAt":"2030-10-25T17:30:00Z"$extra}"""

    @Test fun `activity commands create edit reload and cancel with history and durable schedule`() {
        val team = managedTeam()
        val created = request("/api/activities", activityBody(team, ""","invitationMode":"now","personIds":["$own"]"""), method="POST")
        assertThat(created.statusCode()).isEqualTo(201)
        val id = UUID.fromString(json.readTree(created.body()).get("activity").get("id").asString())
        assertThat(admin.queryForObject("select count(*) from forena.activity_schedule where activity_id=? and state='pending'", Long::class.java, id)).isEqualTo(1)
        assertThat(admin.queryForObject("select count(*) from forena.activity_audit where activity_id=?", Long::class.java, id)).isEqualTo(1)
        val invitees = request("/api/activities/$id/my-invitations")
        assertThat(invitees.statusCode()).isEqualTo(200)
        assertThat(json.readTree(invitees.body()).get("invitations").size()).isEqualTo(1)
        val changed = request("/api/activities/$id", activityBody(team, ""","revision":0""").replace("Ny aktivitet", "Ändrad aktivitet"))
        assertThat(changed.statusCode()).isEqualTo(200)
        assertThat(request("/api/activities/$id", activityBody(team, ""","revision":0""")).statusCode()).isEqualTo(409)
        val editor = request("/api/teams/$team/activity-editor")
        assertThat(editor.statusCode()).isEqualTo(200)
        assertThat(editor.body()).contains("Ändrad aktivitet", "Planen")
        assertThat(request("/api/activities/$id", """{"reason":"Regn","revision":1}""", method="DELETE").statusCode()).isEqualTo(200)
        assertThat(admin.queryForObject("select status from forena.activity where id=?", String::class.java, id)).isEqualTo("cancelled")
        assertThat(admin.queryForObject("select count(*) from forena.activity_schedule where activity_id=? and state='pending'", Long::class.java, id)).isZero()
        assertThat(admin.queryForObject("select count(*) from forena.activity_audit where activity_id=?", Long::class.java, id)).isEqualTo(3)
        assertThat(request("/api/activities/$id", activityBody(team)).statusCode()).isEqualTo(409)
    }

    @Test fun `editing can invite team members atomically while retaining existing answers`() {
        val team = managedTeam()
        val created = request("/api/activities", activityBody(team), method = "POST")
        val id = UUID.fromString(json.readTree(created.body()).get("activity").get("id").asString())
        val extra = ""","revision":0,"invitationMode":"now","personIds":["$own"]"""
        assertThat(request("/api/activities/$id", activityBody(team, extra)).statusCode()).isEqualTo(200)
        val invitation = json.readTree(request("/api/activities/$id/my-invitations").body()).get("invitations").get(0).get("id").asString()
        assertThat(request("/api/invitations/$invitation/respond", """{"response":"accepted","comment":"Kommer direkt"}""").statusCode()).isEqualTo(200)
        assertThat(request("/api/activities/$id", activityBody(team, extra.replace("revision\":0", "revision\":1"))).statusCode()).isEqualTo(200)
        assertThat(admin.queryForObject("select count(*) from forena.invitation where activity_id=?", Long::class.java, id)).isEqualTo(1)
        assertThat(admin.queryForObject("select response from forena.invitation where activity_id=?", String::class.java, id)).isEqualTo("accepted")
        val before = admin.queryForObject("select revision from forena.activity where id=?", Long::class.java, id)
        val invalid = activityBody(team, ""","invitationMode":"now","personIds":["$other"]""").replace("Ny aktivitet", "Får inte sparas")
        assertThat(request("/api/activities/$id", invalid).statusCode()).isEqualTo(400)
        assertThat(admin.queryForObject("select revision from forena.activity where id=?", Long::class.java, id)).isEqualTo(before)
        assertThat(admin.queryForObject("select title from forena.activity where id=?", String::class.java, id)).isEqualTo("Ny aktivitet")
        admin.update("update forena.activity set invitation_send_at=null where id=?", id)
        val scheduled = activityBody(team, ""","revision":2,"invitationMode":"schedule","invitationSelection":{"roles":["participant"]}""")
        assertThat(request("/api/activities/$id", scheduled).statusCode()).isEqualTo(200)
        val preserved = json.readTree(request("/api/activities/$id/my-invitations").body()).get("invitations")
        assertThat(preserved.size()).isEqualTo(1)
        assertThat(preserved.get(0).get("response").asString()).isEqualTo("accepted")
        assertThat(preserved.get(0).get("response_comment").asString()).isEqualTo("Kommer direkt")
    }

    @Test
    fun `editing unchanged schedules preserves delivery state and retry history`() {
        val team = managedTeam()
        val extra =
            ""","invitationMode":"schedule","invitationSelection":{"roles":["participant"]}"""
        val body = activityBody(team, extra)
        val created = request("/api/activities", body, method = "POST")
        assertThat(created.statusCode()).isEqualTo(201)
        val id = UUID.fromString(json.readTree(created.body()).get("activity").get("id").asString())
        val query = "select * from forena.activity_schedule where activity_id=? order by id"

        for ((revision, state) in
            listOf("pending", "completed", "failed", "cancelled").withIndex()) {
            admin.update(
                "update forena.activity_schedule set state=?, attempts=3, next_attempt=due_at+interval '5 minutes', last_error='materialization-failed', completed_at=case when ?='completed' then due_at else null end where activity_id=?",
                state,
                state,
                id,
            )
            val before = admin.queryForList(query, id)
            assertThat(before).isNotEmpty()
            val changed =
                activityBody(team, "$extra,\"revision\":$revision")
                    .replace("Ny aktivitet", "Ändrad aktivitet $revision")
            assertThat(request("/api/activities/$id", changed).statusCode()).isEqualTo(200)
            assertThat(admin.queryForList(query, id)).isEqualTo(before)
        }

        admin.update(
            "update forena.activity_schedule set state='pending', completed_at=null where activity_id=?",
            id,
        )
        val previous = admin.queryForList(query, id)
        val moved = activityBody(team, "$extra,\"revision\":4").replace("2030-10-25", "2030-10-26")
        assertThat(request("/api/activities/$id", moved).statusCode()).isEqualTo(200)
        val schedules = admin.queryForList(query, id)
        val previousIds = previous.map { it["id"] }.toSet()
        assertThat(schedules.filter { it["id"] in previousIds })
            .isEqualTo(previous.map { it + ("state" to "cancelled") })
        val added = schedules.filter { it["id"] !in previousIds }
        assertThat(added).hasSize(previous.size)
        for (entry in added) {
            assertThat(entry["state"]).isEqualTo("pending")
            assertThat(entry["attempts"]).isEqualTo(0)
            assertThat(entry["next_attempt"]).isEqualTo(entry["due_at"])
            assertThat(entry["last_error"]).isNull()
            assertThat(entry["completed_at"]).isNull()
        }
    }

    @Test fun `weekly series creates all occurrences with one identity and rolls back a late failure`() {
        val team = managedTeam()
        val body = """{"teamId":"$team","title":"Veckoträning","startsOn":"2030-10-21","endsOn":"2030-11-04","startTime":"18:00","timeZone":"Europe/Stockholm","weekdays":[1],"timingRules":{"duration":"PT1H","gatheringRule":"start-15m"}}"""
        val created = request("/api/activity-series", body, method = "POST")
        assertThat(created.statusCode()).isEqualTo(201)
        val result = json.readTree(created.body())
        assertThat(result.get("count").asInt()).isEqualTo(3)
        val series = UUID.fromString(result.get("seriesId").asString())
        assertThat(admin.queryForObject("select count(*) from forena.activity where series_id=?", Long::class.java, series)).isEqualTo(3)
        assertThat(result.get("activities").get(0).get("starts_at").asString()).isEqualTo("2030-10-21T16:00:00Z")
        assertThat(result.get("activities").get(1).get("starts_at").asString()).isEqualTo("2030-10-28T17:00:00Z")
        admin.execute("alter table forena.activity add constraint test_series_failure check(title <> 'Återställ serie' or starts_at < '2030-10-28'::timestamptz) not valid")
        try {
            assertThat(request("/api/activity-series", body.replace("Veckoträning", "Återställ serie"), method = "POST").statusCode()).isEqualTo(409)
            assertThat(admin.queryForObject("select count(*) from forena.activity where title='Återställ serie'", Long::class.java)).isZero()
        } finally { admin.execute("alter table forena.activity drop constraint test_series_failure") }
        admin.update("update forena.organization_member set active=false where subject=?", parent)
        assertThat(request("/api/activity-series", body, method = "POST").statusCode()).isEqualTo(403)
    }

    @Test fun `manager overview and details show activities without granting participant response rights`() {
        val team = managedTeam()
        admin.update("update forena.team_membership set active=false where person_id=?", own)
        admin.update("update forena.person_access set active=false where subject=?", parent)
        val created = request("/api/activities", activityBody(team), method = "POST")
        val id = json.readTree(created.body()).get("activity").get("id").asString()
        val detail = request("/api/activities/$id")
        assertThat(detail.statusCode()).isEqualTo(200)
        assertThat(json.readTree(detail.body()).get("people").size()).isZero()
        assertThat(request("/api/me/overview").body()).contains(id)
        assertThat(request("/api/activities/$id/my-invitations").statusCode()).isEqualTo(404)
        admin.update("update forena.organization_member set active=false where subject=?", parent)
        assertThat(request("/api/activities/$id").statusCode()).isEqualTo(404)
        assertThat(request("/api/me/overview").body()).doesNotContain(id)
    }

    @Test fun `empty personal and managed scopes cannot match placeholder IDs`() {
        val zero = UUID(0, 0)
        val id = UUID.randomUUID()
        admin.update("insert into forena.team(id,organization_id,name) values(?,?,'Skyddat lag')", zero, organization)
        admin.update("insert into forena.person(id,organization_id,display_name) values(?,?,'Skyddad person')", zero, organization)
        admin.update("insert into forena.activity(id,organization_id,team_id,title,starts_at,ends_at,status) values(?,?,?,'Skyddad aktivitet','2030-10-25T16:00:00Z','2030-10-25T17:00:00Z','scheduled')", id, organization, zero)
        admin.update("insert into forena.invitation(id,organization_id,activity_id,person_id) values(gen_random_uuid(),?,?,?)", organization, id, zero)
        admin.update("update forena.person_access set active=false where subject=?", parent)
        val overview = request("/api/me/overview")
        assertThat(overview.statusCode()).isEqualTo(200)
        assertThat(json.readTree(overview.body()).get("activities").size()).isZero()
        assertThat(request("/api/activities/$id").statusCode()).isEqualTo(404)
    }

    @Test fun `activity permissions never inherit from guardianship membership or read access`() {
        val team = admin.queryForObject("select team_id from forena.activity where id=?", UUID::class.java, activity)!!
        admin.update("insert into forena.team_membership(organization_id,team_id,person_id,role,starts_on) values(?,?,?,'leader',current_date)", organization, team, child1)
        admin.update("insert into forena.team_permission_assignment(organization_id,team_id,person_id,permission,starts_on) values(?,?,?,'activity.manage',current_date)", organization, team, child1)
        assertThat(request("/api/activities", activityBody(team), method="POST").statusCode()).isEqualTo(403)
        assertThat(request("/api/teams/$team/activity-editor").statusCode()).isEqualTo(403)
        admin.update("insert into forena.team_permission_assignment(organization_id,team_id,person_id,permission,starts_on) values(?,?,?,'activity.manage',current_date)", organization, team, own)
        assertThat(request("/api/activities", activityBody(team), method="POST").statusCode()).isEqualTo(201)
        assertThat(request("/api/activities", activityBody(team, ""","invitationMode":"now","personIds":["$own"]"""), method="POST").statusCode()).isEqualTo(403)
        admin.update("update forena.team_permission_assignment set active=false where person_id=?", own)
        assertThat(request("/api/activities/$activity", activityBody(team)).statusCode()).isEqualTo(403)
    }

    @Test fun `invalid audience type and schedule leave no partially created activity`() {
        val team = managedTeam()
        val count = admin.queryForObject("select count(*) from forena.activity where team_id=?", Long::class.java, team)
        for (extra in listOf(
            ""","invitationMode":"now","personIds":["$other"]""",
            ""","invitationMode":"schedule","invitationSelection":{"roles":[]}""",
            ""","activityTypeId":"${UUID.randomUUID()}"""",
            ""","invitationMode":"schedule","invitationSelection":{"roles":["participant"]},"timingRules":{"invitationRule":"now","responseDueRule":"start-1h","reminderRules":[]}"""
        )) {
            assertThat(request("/api/activities", activityBody(team, extra), method="POST").statusCode()).isEqualTo(400)
            assertThat(admin.queryForObject("select count(*) from forena.activity where team_id=?", Long::class.java, team)).isEqualTo(count)
        }
        val otherTeam = UUID.randomUUID()
        val otherOrganization = UUID.randomUUID()
        admin.update("insert into forena.organization(id,name) values(?,'Främmande')", otherOrganization)
        admin.update("insert into forena.team(id,organization_id,name) values(?,?,'Annat')", otherTeam, otherOrganization)
        assertThat(request("/api/activities", activityBody(otherTeam), method="POST").statusCode()).isEqualTo(403)
    }

    @Test fun `cancel and response serialize through the same lifecycle lock`() {
        managedTeam()
        DriverManager.getConnection(database.jdbcUrl, database.username, database.password).use { connection ->
            connection.autoCommit = false
            connection.prepareStatement("select id from forena.activity where id=? for update").use {
                it.setObject(1, activity); it.executeQuery().close()
            }
            val response = CompletableFuture.supplyAsync { respond("""{"response":"accepted"}""") }
            await().atMost(Duration.ofSeconds(10)).until {
                admin.queryForObject("select count(*) from pg_stat_activity where usename='forena_api_runtime' and wait_event_type='Lock'", Long::class.java)!! > 0
            }
            connection.prepareStatement("update forena.activity set status='cancelled' where id=?").use {
                it.setObject(1, activity); it.executeUpdate()
            }
            connection.commit()
            assertThat(response.get(10, SECONDS).statusCode()).isEqualTo(409)
            assertThat(row()["revision"]).isEqualTo(0L)
        }
    }

    @Test @EnabledIfEnvironmentVariable(named = "FORENA_M09_BROWSER_TEST", matches = "true")
    fun `browser creates edits and cancels activities through real Spring and PostgreSQL`() {
        val team = managedTeam()
        val process = ProcessBuilder("node", "scripts/migration/activity-management-browser.mjs")
            .directory(Path.of("..").toFile()).redirectErrorStream(true)
            .redirectOutput(Path.of("target/activity-management-browser.log").toFile())
        process.environment().keys.removeIf { it.startsWith("FORENA_") }
        process.environment().putAll(mapOf(
            "FORENA_M09_API" to "http://127.0.0.1:${environment.getRequiredProperty("local.server.port")}",
            "FORENA_M09_EMAIL" to "$parent@example.invalid", "FORENA_M09_TEAM" to team.toString(),
            "FORENA_BROWSER_EXECUTABLE" to (System.getenv("FORENA_BROWSER_EXECUTABLE") ?: "")))
        val child = process.start()
        if (!child.waitFor(180, SECONDS)) { child.destroyForcibly(); error("Activity browser timed out") }
        assertThat(child.exitValue()).withFailMessage("See target/activity-management-browser.log").isZero()
        val saved = admin.queryForMap("select id,status,revision,location from forena.activity where team_id=? and title='Uppdaterad browserträning'", team)
        assertThat(saved["status"]).isEqualTo("cancelled")
        assertThat(saved["revision"]).isEqualTo(2L)
        assertThat(saved["location"]).isEqualTo("Stora planen")
        assertThat(admin.queryForObject("select count(*) from forena.activity_audit where activity_id=?", Long::class.java, saved["id"])).isEqualTo(3)
    }

    @Test fun `late audit failure rolls back activity schedules and signals together`() {
        val team = managedTeam()
        val before = admin.queryForObject("select count(*) from forena.activity where team_id=?", Long::class.java, team)
        admin.execute("alter table forena.activity_audit add constraint test_activity_audit_failure check(false) not valid")
        try {
            val response = request("/api/activities", activityBody(team, ""","invitationMode":"now","personIds":["$own"]"""), method="POST")
            assertThat(response.statusCode()).isEqualTo(409)
            assertThat(response.headers().firstValue("Cache-Control").orElse("")).contains("no-store")
            assertThat(response.body()).doesNotContain("test_activity_audit_failure", "SQL", "Exception")
            assertThat(admin.queryForObject("select count(*) from forena.activity where team_id=?", Long::class.java, team)).isEqualTo(before)
            assertThat(admin.queryForObject("select count(*) from forena.activity_schedule s join forena.activity a on a.id=s.activity_id where a.team_id=?", Long::class.java, team)).isZero()
        } finally { admin.execute("alter table forena.activity_audit drop constraint test_activity_audit_failure") }
    }

    @Test fun `scheduled audiences preserve scoped groups defaults and all reminder times`() {
        val team = managedTeam()
        val section = UUID.randomUUID()
        val group = UUID.randomUUID()
        val type = UUID.fromString("00000000-0000-4000-8000-000000000004")
        admin.update("insert into forena.section(id,organization_id,name,discipline_key) values(?,?,'Sektion','football')", section, organization)
        admin.update("update forena.team set section_id=? where id=?", section, team)
        admin.update("insert into forena.activity_defaults(organization_id,section_id,activity_type_id,discipline_key,values_json) values(?,?,?,'football',?)",
            organization, section, type, """{"invitationRule":"start-3d","responseDueRule":"start-6h","reminderRules":["deadline-2h","deadline-1h"]}""")
        admin.update("insert into forena.team_audience_group(id,organization_id,team_id,name,kind) values(?,?,?,'Grön','group')", group, organization, team)
        val extra = ""","invitationMode":"schedule","invitationSelection":{"roles":[],"groupIds":["$group"]}"""
        val created = request("/api/activities", activityBody(team, extra), method="POST")
        assertThat(created.statusCode()).isEqualTo(201)
        val id = UUID.fromString(json.readTree(created.body()).get("activity").get("id").asString())
        assertThat(admin.queryForObject("select count(*) from forena.activity_schedule where activity_id=?", Long::class.java, id)).isEqualTo(3)
        assertThat(admin.queryForObject("select group_ids from forena.activity_schedule where activity_id=? and kind='invitation'", String::class.java, id)).isEqualTo(group.toString())
        val sendAt = admin.queryForObject("select invitation_send_at from forena.activity where id=?", Timestamp::class.java, id)
        assertThat(sendAt!!.toInstant()).isEqualTo(Instant.parse("2030-10-22T16:00:00Z"))
        assertThat(request("/api/activities/$id", activityBody(team).replace("2030-10-25T16:00:00Z", "2030-10-25T09:00:00Z")).statusCode()).isEqualTo(400)
        val editor = request("/api/teams/$team/activity-editor")
        assertThat(editor.body()).contains("football", "Grön", "start-3d")
        assertThat(request("/api/activities/$id", activityBody(team).replace("2030-10-25T16:00:00Z", "2030-10-25T16:30:00Z")).statusCode()).isEqualTo(200)
        assertThat(admin.queryForObject("select invitation_send_at from forena.activity where id=?", Timestamp::class.java, id)).isEqualTo(sendAt)
    }

    private fun bootstrapAdministrator() {
        admin.update("update forena.native_user set email=? where subject=?", "bootstrap@example.invalid", parent)
        assertThat(request("/api/admin/bootstrap", "{}", method="POST").statusCode()).isEqualTo(200)
        // Keep the configured address unique across independently seeded tests.
        admin.update("update forena.native_user set email=? where subject=?", "$parent@example.invalid", parent)
    }

    private fun createAdminClub(): UUID {
        val slug = "club-" + UUID.randomUUID().toString()
        val response = request("/api/admin/clubs", """{"organizationName":"Ny klubb","organizationSlug":"$slug","timeZone":"Europe/Stockholm","sectionName":"Fotboll","sectionSlug":"fotboll","disciplineKey":"football"}""", method="POST")
        assertThat(response.statusCode()).isEqualTo(200)
        return UUID.fromString(json.readTree(response.body()).get("id").asString())
    }

    @Test fun `complete administration chain separates platform and business authority`() {
        assertThat(request("/api/admin/bootstrap", "{}", method="POST").statusCode()).isEqualTo(403)
        bootstrapAdministrator()
        assertThat(request("/api/admin/bootstrap", "{}", method="POST").statusCode()).isEqualTo(409)
        val club = createAdminClub()
        val section = admin.queryForObject("select id from forena.section where organization_id=?", UUID::class.java, club)!!
        val created = request("/api/admin/sections/$section/teams", """{"name":"F2016","season":"2030"}""", method="POST")
        assertThat(created.statusCode()).isEqualTo(200)
        val team = UUID.fromString(json.readTree(created.body()).get("id").asString())
        assertThat(request("/api/activities", activityBody(team), method="POST").statusCode()).isEqualTo(403)
        assertThat(request("/api/admin/teams/$team/administrators", """{"email":"$outsider@example.invalid","name":"Lagadmin"}""", method="POST").statusCode()).isEqualTo(403)
        assertThat(request("/api/admin/clubs/$club/administrators", """{"email":"$parent@example.invalid"}""", method="POST").statusCode()).isEqualTo(200)
        assertThat(request("/api/admin/teams/$team/administrators", """{"email":"$outsider@example.invalid","name":"Lagadmin"}""", method="POST").statusCode()).isEqualTo(200)
        val outsiderCookie = loginCookie(outsider)
        assertThat(request("/api/me/overview", cookie=outsiderCookie).body()).contains(team.toString())
        assertThat(request("/api/activities", activityBody(team), cookie=outsiderCookie, method="POST").statusCode()).isEqualTo(201)
        assertThat(request("/api/admin/platform-administrators", """{"email":"$outsider@example.invalid"}""", cookie=outsiderCookie, method="POST").statusCode()).isEqualTo(403)
        assertThat(request("/api/admin/teams/$team/administrators", """{"email":"$outsider@example.invalid","active":false}""", method="POST").statusCode()).isEqualTo(200)
        assertThat(request("/api/activities", activityBody(team), cookie=outsiderCookie, method="POST").statusCode()).isEqualTo(403)
        assertThat(request("/api/me/overview", cookie=outsiderCookie).body()).doesNotContain(team.toString())
        assertThat(admin.queryForObject("select count(*) from forena.administration_audit where target_id in (?,?,?)", Long::class.java, club, section, team)).isGreaterThanOrEqualTo(4)
        assertThat(request("/api/admin/platform-administrators", """{"email":"$parent@example.invalid","active":false}""", method="POST").statusCode()).isEqualTo(409)
    }

    @Test fun `administrative workspaces include empty teams within current business authority`() {
        admin.update("delete from forena.person_access where subject=?", outsider)
        bootstrapAdministrator()
        val club = createAdminClub()
        val section = admin.queryForObject("select id from forena.section where organization_id=?", UUID::class.java, club)!!
        val created = request("/api/admin/sections/$section/teams", """{"name":"F2016"}""", method="POST")
        assertThat(created.statusCode()).isEqualTo(200)
        val team = json.readTree(created.body()).get("id").asString()
        // Platform authority alone must not create a business workspace.
        assertThat(request("/api/me/overview").body()).doesNotContain(team)
        assertThat(request("/api/admin/clubs/$club/administrators", """{"email":"$parent@example.invalid"}""", method="POST").statusCode()).isEqualTo(200)
        val clubOverview = json.readTree(request("/api/me/overview").body())
        assertThat(clubOverview.get("teams").single { it.get("id").asString() == team }.get("roles").toString()).contains("team_access")
        assertThat(clubOverview.get("activities").size()).isEqualTo(1)

        assertThat(request("/api/admin/sections/$section/administrators", """{"email":"$outsider@example.invalid"}""", method="POST").statusCode()).isEqualTo(200)
        val outsiderCookie = loginCookie(outsider)
        // The section administrator has no personal identity in this club.
        assertThat(admin.queryForObject("select count(*) from forena.person_access where subject=? and organization_id=?", Long::class.java, outsider, club)).isZero()
        val anotherSection = request("/api/admin/clubs/$club/sections", """{"name":"Annan","slug":"annan","disciplineKey":"common"}""", method="POST")
        assertThat(anotherSection.statusCode()).isEqualTo(200)
        val otherSection = json.readTree(anotherSection.body()).get("id").asString()
        val otherTeamResponse = request("/api/admin/sections/$otherSection/teams", """{"name":"Annat lag"}""", method="POST")
        assertThat(otherTeamResponse.statusCode()).isEqualTo(200)
        val otherTeam = json.readTree(otherTeamResponse.body()).get("id").asString()
        val foreignClub = createAdminClub()
        val overview = json.readTree(request("/api/me/overview", cookie=outsiderCookie).body())
        assertThat(overview.get("teams").toList().map { it.get("id").asString() }).containsExactly(team)
        assertThat(overview.get("organizations").toList().map { it.get("id").asString() }).containsExactly(club.toString())
        assertThat(overview.get("activities").size()).isZero()
        assertThat(overview.toString()).doesNotContain(otherTeam, foreignClub.toString())
        assertThat(request("/api/admin/sections/$section/administrators", """{"email":"$outsider@example.invalid","active":false}""", method="POST").statusCode()).isEqualTo(200)
        val revoked = json.readTree(request("/api/me/overview", cookie=outsiderCookie).body())
        assertThat(revoked.get("teams").size()).isZero()
        assertThat(revoked.get("organizations").size()).isZero()
    }

    @Test fun `section administrators are confined to their own section and foreign role grants are denied`() {
        bootstrapAdministrator()
        val club = createAdminClub()
        val section = admin.queryForObject("select id from forena.section where organization_id=?", UUID::class.java, club)!!
        assertThat(request("/api/admin/sections/$section/administrators", """{"email":"$outsider@example.invalid"}""", method="POST").statusCode()).isEqualTo(200)
        val outsiderCookie = loginCookie(outsider)
        assertThat(request("/api/admin/sections/$section/teams", """{"name":"Eget lag"}""", cookie=outsiderCookie, method="POST").statusCode()).isEqualTo(200)
        assertThat(request("/api/admin/clubs/$club/sections", """{"name":"Annan","slug":"annan","disciplineKey":"common"}""", cookie=outsiderCookie, method="POST").statusCode()).isEqualTo(403)
        val foreignClub = createAdminClub()
        val foreignSection = admin.queryForObject("select id from forena.section where organization_id=?", UUID::class.java, foreignClub)!!
        assertThat(request("/api/admin/sections/$foreignSection/teams", """{"name":"Intrång"}""", cookie=outsiderCookie, method="POST").statusCode()).isEqualTo(403)
        assertThat(request("/api/admin/overview", cookie=outsiderCookie).body()).doesNotContain(foreignClub.toString(), foreignSection.toString())
        assertThat(request("/api/admin/sections/$section/administrators", """{"email":"$outsider@example.invalid","active":false}""", method="POST").statusCode()).isEqualTo(200)
        assertThat(request("/api/admin/sections/$section/teams", """{"name":"Efter återkallning"}""", cookie=outsiderCookie, method="POST").statusCode()).isEqualTo(403)
    }

    @Test fun `club creation is atomic and last section and nonempty teams are protected`() {
        bootstrapAdministrator()
        val before = admin.queryForObject("select count(*) from forena.organization", Long::class.java)
        assertThat(request("/api/admin/clubs", """{"organizationName":"Ogiltig","organizationSlug":"invalid","timeZone":"Europe/Stockholm","sectionName":"Sektion","sectionSlug":"sektion","disciplineKey":"football","teamName":""}""", method="POST").statusCode()).isEqualTo(400)
        assertThat(admin.queryForObject("select count(*) from forena.organization", Long::class.java)).isEqualTo(before)
        val club = createAdminClub()
        val section = admin.queryForObject("select id from forena.section where organization_id=?", UUID::class.java, club)!!
        assertThat(request("/api/admin/sections/$section", method="DELETE").statusCode()).isEqualTo(409)
        val created = request("/api/admin/sections/$section/teams", """{"name":"Tomt lag"}""", method="POST")
        val team = UUID.fromString(json.readTree(created.body()).get("id").asString())
        assertThat(request("/api/admin/teams/$team", method="DELETE").statusCode()).isEqualTo(200)
        assertThat(request("/api/admin/teams/${admin.queryForObject("select team_id from forena.activity where id=?", UUID::class.java, activity)}", method="DELETE").statusCode()).isEqualTo(409)
    }

    @Test @EnabledIfEnvironmentVariable(named = "FORENA_M09_BROWSER_TEST", matches = "true")
    fun `browser starts with bootstrap and assigns a separate team administrator who creates an activity`() {
        admin.update("update forena.native_user set email='bootstrap@example.invalid' where subject=?", parent)
        try {
            val process = ProcessBuilder("node", "scripts/migration/activity-management-browser.mjs")
                .directory(Path.of("..").toFile()).redirectErrorStream(true)
                .redirectOutput(Path.of("target/administration-browser.log").toFile())
            process.environment().keys.removeIf { it.startsWith("FORENA_") }
            process.environment().putAll(mapOf(
                "FORENA_M09_API" to "http://127.0.0.1:${environment.getRequiredProperty("local.server.port")}",
                "FORENA_M09_EMAIL" to "bootstrap@example.invalid", "FORENA_M09_ADMIN_CHAIN" to "true",
                "FORENA_M09_TEAM_ADMIN_EMAIL" to "$outsider@example.invalid",
                "FORENA_BROWSER_EXECUTABLE" to (System.getenv("FORENA_BROWSER_EXECUTABLE") ?: "")))
            val child = process.start()
            if (!child.waitFor(180, SECONDS)) { child.destroyForcibly(); error("Administration browser timed out") }
            assertThat(child.exitValue()).withFailMessage("See target/administration-browser.log").isZero()
            val createdClub = admin.queryForObject("select id from forena.organization where slug='browserklubben'", UUID::class.java)!!
            assertThat(admin.queryForObject("select count(*) from forena.team_administrator where organization_id=? and subject=? and active", Long::class.java, createdClub, outsider)).isEqualTo(1)
            assertThat(admin.queryForObject("select count(*) from forena.activity where organization_id=? and title='Uppdaterad browserträning' and status='cancelled'", Long::class.java, createdClub)).isEqualTo(1)
        } finally { admin.update("update forena.native_user set email=? where subject=?", "$parent@example.invalid", parent) }
    }

    @Test fun `unauthorized bootstrap never waits for the administration write lock`() {
        DriverManager.getConnection(database.jdbcUrl, database.username, database.password).use { connection ->
            connection.autoCommit = false
            connection.createStatement().use { it.executeQuery("select * from forena.administration_state for update").close() }
            try {
                val result = CompletableFuture.supplyAsync { request("/api/admin/bootstrap", "{}", method="POST") }
                assertThat(result.get(3, SECONDS).statusCode()).isEqualTo(403)
            } finally { connection.rollback() }
        }
    }

    @Test fun `unauthorized bootstrap consumes no shared budget and authorized attempts are limited separately from login`() {
        repeat(12) { assertThat(request("/api/admin/bootstrap", "{}", method="POST").statusCode()).isEqualTo(403) }
        assertThat(admin.queryForObject("select count(*) from forena.auth_rate_limit where key_hash=?",
            Long::class.java, browserSettings.fingerprint("admin-bootstrap-global"))).isZero()
        admin.update("update forena.native_user set email='bootstrap@example.invalid' where subject=?", parent)
        try {
            repeat(3) { loginLimiter.admitBootstrap("127.0.0.1", parent) }
            val limited = request("/api/admin/bootstrap", "{}", method="POST")
            assertThat(limited.statusCode()).isEqualTo(429)
            assertThat(limited.headers().firstValue("Retry-After")).isPresent()
            assertThat(limited.headers().firstValue("Cache-Control").orElse("")).contains("no-store")
            assertThat(limited.body()).contains("administrationsförsök")
            assertThatCode { repeat(3) { loginLimiter.admit("127.0.0.1") } }.doesNotThrowAnyException()
        } finally { admin.update("update forena.native_user set email=? where subject=?", "$parent@example.invalid", parent) }
    }

    @Test fun `revoking absent administrators creates no person access or role and leaves empty sections deletable`() {
        bootstrapAdministrator()
        val club = createAdminClub()
        val section = admin.queryForObject("select id from forena.section where organization_id=?", UUID::class.java, club)!!
        request("/api/admin/clubs/$club/administrators", """{"email":"$parent@example.invalid"}""", method="POST")
        val createdTeam = request("/api/admin/sections/$section/teams", """{"name":"Tomt lag"}""", method="POST")
        val team = UUID.fromString(json.readTree(createdTeam.body()).get("id").asString())
        val revoke = """{"email":"$outsider@example.invalid","active":false}"""
        repeat(2) {
            assertThat(request("/api/admin/sections/$section/administrators", revoke, method="POST").statusCode()).isEqualTo(200)
            assertThat(request("/api/admin/teams/$team/administrators", revoke, method="POST").statusCode()).isEqualTo(200)
        }
        for (table in listOf("person", "person_access", "team_access_assignment", "team_administrator", "section_administrator")) {
            assertThat(admin.queryForObject("select count(*) from forena.$table where organization_id=?", Long::class.java, club)).isZero()
        }
        assertThat(request("/api/admin/teams/$team", method="DELETE").statusCode()).isEqualTo(200)
        assertThat(request("/api/admin/clubs/$club/sections", """{"name":"Andra sektionen","slug":"andra","disciplineKey":"common"}""", method="POST").statusCode()).isEqualTo(200)
        assertThat(request("/api/admin/sections/$section", method="DELETE").statusCode()).isEqualTo(200)
    }

    @Test fun `management candidates and administration overview load only the callers organizations`() {
        bootstrapAdministrator()
        val club = createAdminClub()
        val section = admin.queryForObject("select id from forena.section where organization_id=?", UUID::class.java, club)!!
        val created = request("/api/admin/sections/$section/teams", """{"name":"Eget lag"}""", method="POST")
        val team = UUID.fromString(json.readTree(created.body()).get("id").asString())
        assertThat(request("/api/admin/sections/$section/administrators", """{"email":"$outsider@example.invalid"}""", method="POST").statusCode()).isEqualTo(200)
        val outsiderCookie = loginCookie(outsider)
        clearInvocations(clubRecords)
        val overview = request("/api/admin/overview", cookie=outsiderCookie)
        assertThat(overview.statusCode()).isEqualTo(200)
        assertThat(overview.body()).contains(club.toString()).doesNotContain(organization.toString())
        verify(clubRecords, never()).findAllByOrderByNameAsc()
        verify(clubRecords).findByIdInOrderByNameAsc(setOf(club))
        assertThat(managementRecords.teams(outsider).map { it.id }).containsExactly(team)
        val managed = request("/api/me/managed-teams", cookie=outsiderCookie)
        assertThat(managed.statusCode()).isEqualTo(200)
        assertThat(managed.body()).contains(team.toString()).doesNotContain(organization.toString())
        assertThat(managementRecords.team(team)?.id).isEqualTo(team)
        assertThat(managementRecords.team(UUID.randomUUID())).isNull()
    }

    @Test fun `all unauthorized administration writes reject before waiting for the global lock`() {
        bootstrapAdministrator()
        val club = createAdminClub()
        val section = admin.queryForObject("select id from forena.section where organization_id=?", UUID::class.java, club)!!
        val created = request("/api/admin/sections/$section/teams", """{"name":"Skyddat lag"}""", method="POST")
        val team = UUID.fromString(json.readTree(created.body()).get("id").asString())
        val outsiderCookie = loginCookie(outsider)
        val role = """{"email":"$outsider@example.invalid"}"""
        val sectionChange = """{"name":"Sektion","slug":"sektion","disciplineKey":"football"}"""
        val writes = listOf(
            Triple("POST", "/api/admin/platform-administrators", role),
            Triple("POST", "/api/admin/clubs", """{"organizationName":"Klubb","organizationSlug":"obehorig","timeZone":"Europe/Stockholm","sectionName":"Fotboll","sectionSlug":"fotboll","disciplineKey":"football"}"""),
            Triple("PUT", "/api/admin/clubs/$club", """{"name":"Klubb","slug":"obehorig","timeZone":"Europe/Stockholm"}"""),
            Triple("POST", "/api/admin/clubs/$club/administrators", role),
            Triple("POST", "/api/admin/clubs/$club/sections", sectionChange),
            Triple("PUT", "/api/admin/clubs/$club/sections/$section", sectionChange),
            Triple("DELETE", "/api/admin/sections/$section", null),
            Triple("POST", "/api/admin/sections/$section/administrators", role),
            Triple("POST", "/api/admin/sections/$section/teams", """{"name":"Lag"}"""),
            Triple("PUT", "/api/admin/sections/$section/teams/$team", """{"name":"Lag"}"""),
            Triple("DELETE", "/api/admin/teams/$team", null),
            Triple("POST", "/api/admin/teams/$team/administrators", role)
        )
        DriverManager.getConnection(database.jdbcUrl, database.username, database.password).use { connection ->
            connection.autoCommit = false
            connection.createStatement().use { it.executeQuery("select * from forena.administration_state for update").close() }
            try {
                for ((method, path, body) in writes) {
                    val result = CompletableFuture.supplyAsync { request(path, body, cookie=outsiderCookie, method=method) }
                    assertThat(result.get(3, SECONDS).statusCode()).describedAs("$method $path").isEqualTo(403)
                }
            } finally { connection.rollback() }
        }
    }

    @Test fun `only authorized mutations consume shared admission budgets and 429 leaves reads available`() {
        val outsiderCookie = loginCookie(outsider)
        repeat(12) {
            assertThat(request("/api/admin/platform-administrators", """{"email":"$parent@example.invalid"}""", cookie=outsiderCookie, method="POST").statusCode()).isEqualTo(403)
        }
        assertThat(admin.queryForObject("select count(*) from forena.auth_rate_limit where key_hash=?",
            Long::class.java, browserSettings.fingerprint("admin-mutation-global"))).isZero()
        bootstrapAdministrator()
        val hash = browserSettings.fingerprint("admin-mutation-account:$parent")
        admin.update("insert into forena.auth_rate_limit(key_hash,available_at) values(?,clock_timestamp()+interval '60 seconds')", hash)
        val limited = request("/api/admin/platform-administrators", """{"email":"$outsider@example.invalid"}""", method="POST")
        assertThat(limited.statusCode()).isEqualTo(429)
        assertThat(limited.headers().firstValue("Retry-After")).isPresent()
        assertThat(limited.headers().firstValue("Cache-Control").orElse("")).contains("no-store")
        assertThat(request("/api/admin/overview").statusCode()).isEqualTo(200)
        assertThat(request("/api/admin/bootstrap", "{}", method="POST").statusCode()).isEqualTo(409)
    }

    @Test fun `administration rechecks a revoked role after waiting for the global lock`() {
        bootstrapAdministrator()
        val club = createAdminClub()
        val section = admin.queryForObject("select id from forena.section where organization_id=?", UUID::class.java, club)!!
        request("/api/admin/sections/$section/administrators", """{"email":"$outsider@example.invalid"}""", method="POST")
        val outsiderCookie = loginCookie(outsider)
        DriverManager.getConnection(database.jdbcUrl, database.username, database.password).use { connection ->
            connection.autoCommit = false
            connection.createStatement().use { it.executeQuery("select * from forena.administration_state for update").close() }
            val result = CompletableFuture.supplyAsync { request("/api/admin/sections/$section/teams", """{"name":"Nekat efter väntan"}""", cookie=outsiderCookie, method="POST") }
            try {
                await().atMost(Duration.ofSeconds(10)).until {
                    admin.queryForObject("select count(*) from pg_stat_activity where usename='forena_api_runtime' and wait_event_type='Lock'", Long::class.java)!! > 0
                }
                admin.update("update forena.section_administrator set active=false where subject=?", outsider)
            } finally { connection.rollback() }
            assertThat(result.get(10, SECONDS).statusCode()).isEqualTo(403)
            assertThat(admin.queryForObject("select count(*) from forena.team where section_id=?", Long::class.java, section)).isZero()
        }
    }

    @Test fun `bootstrap is serialized and only the configured verified account can activate it`() {
        admin.update("update forena.native_user set email='bootstrap@example.invalid' where subject=?", parent)
        try {
            val first = CompletableFuture.supplyAsync { request("/api/admin/bootstrap", "{}", method="POST").statusCode() }
            val second = CompletableFuture.supplyAsync { request("/api/admin/bootstrap", "{}", method="POST").statusCode() }
            assertThat(listOf(first.get(10, SECONDS), second.get(10, SECONDS))).containsExactlyInAnyOrder(200, 409)
            assertThat(admin.queryForObject("select count(*) from forena.platform_administrator", Long::class.java)).isEqualTo(1)
        } finally { admin.update("update forena.native_user set email=? where subject=?", "$parent@example.invalid", parent) }
    }

    @Test fun `future and revoked person access deny team administration and independent read access survives role removal`() {
        bootstrapAdministrator()
        val club = createAdminClub()
        val section = admin.queryForObject("select id from forena.section where organization_id=?", UUID::class.java, club)!!
        request("/api/admin/clubs/$club/administrators", """{"email":"$parent@example.invalid"}""", method="POST")
        val response = request("/api/admin/sections/$section/teams", """{"name":"Datumlag"}""", method="POST")
        val team = UUID.fromString(json.readTree(response.body()).get("id").asString())
        val future = java.time.LocalDate.now(java.time.ZoneId.of("Europe/Stockholm")).plusDays(1)
        val target = """{"email":"$outsider@example.invalid","name":"Lagadmin","startsOn":"$future"}"""
        assertThat(request("/api/admin/teams/$team/administrators", target, method="POST").statusCode()).isEqualTo(200)
        val outsiderCookie = loginCookie(outsider)
        assertThat(request("/api/activities", activityBody(team), cookie=outsiderCookie, method="POST").statusCode()).isEqualTo(403)
        assertThat(request("/api/admin/overview", cookie=outsiderCookie).body()).doesNotContain(team.toString())
        assertThat(request("/api/admin/teams/$team/administrators", """{"email":"$outsider@example.invalid","name":"Lagadmin"}""", method="POST").statusCode()).isEqualTo(200)
        val person = admin.queryForObject("select person_id from forena.team_administrator where team_id=?", UUID::class.java, team)!!
        val independent = UUID.randomUUID()
        admin.update("insert into forena.team_access_assignment(id,organization_id,team_id,person_id,starts_on) values(?,?,?,?,current_date)", independent, club, team, person)
        admin.update("update forena.person_access set active=false where subject=? and organization_id=?", outsider, club)
        assertThat(request("/api/activities", activityBody(team), cookie=outsiderCookie, method="POST").statusCode()).isEqualTo(403)
        assertThat(request("/api/admin/teams/$team/administrators", """{"email":"$outsider@example.invalid","active":false}""", method="POST").statusCode()).isEqualTo(200)
        assertThat(admin.queryForObject("select active from forena.team_access_assignment where id=?", Boolean::class.java, independent)).isTrue()
    }

}
