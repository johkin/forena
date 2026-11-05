package se.forena.api

import org.springframework.aop.support.AopUtils
import org.springframework.security.authorization.AuthorizationDeniedException
import org.springframework.security.authentication.BadCredentialsException
import org.mockito.Mockito
import org.mockito.Mockito.times
import org.mockito.ArgumentMatchers.anyString
import org.mockito.ArgumentMatchers.anyMap
import se.forena.api.activities.ActivityDutyCommand
import se.forena.api.telegram.TelegramUpdateRetentionService
import se.forena.api.telegram.TelegramGroupService
import se.forena.api.assistant.AssistantTarget
import se.forena.api.assistant.RoutingPlan
import se.forena.api.assistant.MessageCommand
import se.forena.api.assistant.ModelAnswer
import se.forena.api.identity.AssistantRoleSource
import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import java.time.LocalDate
import java.time.ZoneId
import java.sql.Date
import org.springframework.context.annotation.Import
import se.forena.api.identity.authentication.AuthMailService
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
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
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
import org.springframework.security.access.AccessDeniedException
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
@Import(AuthTest.MailConfiguration::class)
class ApiTest {
    @Test fun `player evaluation metric edits preserve current scores and confirmed deletion removes only its values`() {
        val team = managedTeam()
        val base = "/api/teams/$team/player-evaluation"
        val metric = UUID.randomUUID()
        var revision: String? = null
        fun configure(name: String, kind: String, include: Boolean = true, confirm: Boolean = false) = request(base,
            json.writeValueAsString(mapOf("revision" to revision, "enabled" to true, "threshold" to 0, "defaultGroups" to 3,
                "confirmDeletion" to confirm, "metrics" to if (include) listOf(mapOf("id" to metric, "name" to name, "kind" to kind)) else emptyList())))
        var response = configure("Teknik", "ability")
        assertThat(response.statusCode()).isEqualTo(200)
        revision = json.readTree(response.body()).get("revision").asString()
        response = request("$base/scores", json.writeValueAsString(mapOf("revision" to revision,
            "scores" to listOf(mapOf("personId" to own, "metricId" to metric, "value" to 6)))))
        assertThat(response.statusCode()).isEqualTo(200)
        revision = json.readTree(response.body()).get("revision").asString()
        val priorTypeRevision = revision
        response = configure("Nytt namn", "development")
        assertThat(response.statusCode()).isEqualTo(200)
        revision = json.readTree(response.body()).get("revision").asString()
        assertThat(json.readTree(response.body()).get("scores").single().get("value").asInt()).isEqualTo(6)
        assertThat(json.readTree(response.body()).get("metrics").single().get("kind").asString()).isEqualTo("development")
        assertThat(request("$base/scores", json.writeValueAsString(mapOf("revision" to priorTypeRevision, "scores" to emptyList<Any>()))).statusCode()).isEqualTo(409)
        assertThat(configure("", "ability", include = false).statusCode()).isEqualTo(400)
        assertThat(json.readTree(request(base).body()).get("scores").size()).isEqualTo(1)
        assertThat(configure("", "ability", include = false, confirm = true).statusCode()).isEqualTo(200)
        assertThat(json.readTree(request(base).body()).get("scores").size()).isZero()
    }
    @Test
    @EnabledIfEnvironmentVariable(named = "FORENA_EVALUATION_BROWSER_TEST", matches = "true")
    fun `browser player evaluation flows through actual API and database`() {
        val team = managedTeam()
        rosterMember(child1); rosterMember(child2)
        admin.update("update forena.activity set activity_type_id='00000000-0000-4000-8000-000000000001' where id=?", activity)
        admin.update("update forena.invitation set activity_role='participant',response='accepted',responded_at=now() where activity_id=?", activity)
        val process = ProcessBuilder("node", "scripts/migration/player-evaluation-e2e.mjs")
            .directory(Path.of("..").toFile()).redirectErrorStream(true)
            .redirectOutput(Path.of("target/evaluation-browser.log").toFile())
        process.environment().putAll(mapOf(
            "FORENA_EVALUATION_API" to "http://127.0.0.1:${environment.getRequiredProperty("local.server.port")}",
            "FORENA_EVALUATION_FRONTEND" to "http://127.0.0.1:3001",
            "FORENA_EVALUATION_EMAIL" to "$parent@example.invalid",
            "FORENA_EVALUATION_TEAM" to team.toString(), "FORENA_EVALUATION_ACTIVITY" to activity.toString(),
        ))
        val running = process.start()
        try {
            assertThat(running.waitFor(120, SECONDS)).isTrue()
            assertThat(running.exitValue()).withFailMessage(Files.readString(Path.of("target/evaluation-browser.log"))).isZero()
        } finally { if (running.isAlive) running.destroyForcibly() }
        assertThat(admin.queryForObject("select count(*) from forena.player_evaluation where team_id=?", Long::class.java, team)).isZero()
        assertThat(admin.queryForObject("select count(*) from forena.invitation where activity_id=? and response='accepted'", Long::class.java, activity)).isEqualTo(4)
    }
    @Test fun `player evaluation reports and training use current team scores and validate selection and thresholds`() {
        val team = managedTeam()
        rosterMember(child1); rosterMember(child2)
        // Invited outsider is borrowed: never require membership to include their yes response.
        admin.update("update forena.activity set activity_type_id='00000000-0000-4000-8000-000000000001' where id=?", activity)
        admin.update("update forena.invitation set activity_role='participant',response='accepted',responded_at=now() where activity_id=?", activity)
        val base = "/api/teams/$team/player-evaluation"
        val metric = UUID.randomUUID()
        val indicators = (1..3).map { UUID.randomUUID() }
        val metrics = listOf(mapOf("id" to metric, "name" to "Teknik", "kind" to "ability")) + indicators.map { mapOf("id" to it, "name" to "Driv", "kind" to "development") }
        var response = request(base, json.writeValueAsString(mapOf("enabled" to true, "metrics" to metrics, "threshold" to 7, "defaultGroups" to 2)))
        assertThat(response.statusCode()).withFailMessage(response.body()).isEqualTo(200)
        val revision = json.readTree(response.body()).get("revision").asString()
        val scores = listOf(own to 9, child1 to 5, child2 to 3).map { (person, value) -> mapOf("personId" to person, "metricId" to metric, "value" to value) } +
            listOf(child1, child2).flatMap { person -> indicators.mapIndexed { index, id -> mapOf("personId" to person, "metricId" to id, "value" to if (person == child1) listOf(6, 7, 7)[index] else 7) } }
        response = request("$base/scores", json.writeValueAsString(mapOf("revision" to revision, "scores" to scores)))
        assertThat(response.statusCode()).withFailMessage(response.body()).isEqualTo(200)
        val reportPath = "/api/teams/$team/read-views"
        val report = request(reportPath)
        assertThat(report.statusCode()).withFailMessage(report.body()).isEqualTo(200)
        val views = json.readTree(report.body()).single().get("views")
        val grouped = views.single { it.get("type").asString() == "groupedList" }.get("groups")
        assertThat(grouped.toList().map { it.get("rows").size() }).containsExactly(2, 1)
        assertThat(grouped.last().get("rows").single().get("markers").size()).isEqualTo(1)
        val allRows = grouped.flatMap { it.get("rows").toList() }
        assertThat(allRows.single { it.get("id").asString() == child1.toString() }.get("markers").size()).isZero()
        assertThat(allRows.map { it.get("id").asString() }).doesNotContain(other.toString())
        val trainingPath = "$reportPath?activityId=$activity"
        val training = request(trainingPath)
        assertThat(training.statusCode()).withFailMessage(training.body()).isEqualTo(200)
        val missing = json.readTree(training.body()).single().get("views").single { it.get("type").asString() == "list" }
        assertThat(missing.get("rows").single().get("id").asString()).isEqualTo(other.toString())
        assertThat(request("$trainingPath&groupCount=1").statusCode()).isEqualTo(400)
        assertThat(request("$trainingPath&groupCount=4").statusCode()).isEqualTo(400)
        assertThat(request("$trainingPath&groupCount=2.5").statusCode()).isEqualTo(400)
        assertThat(request("$trainingPath&personIds=${UUID.randomUUID()}").statusCode()).isEqualTo(400)
        val balanced = json.readTree(request("$trainingPath&mode=balanced").body()).single().get("views").single { it.get("type").asString() == "groupedList" }
        assertThat(balanced.get("groups").flatMap { it.get("rows").toList() }.all { it.get("markers").isEmpty }).isTrue()
        assertThat(request("$trainingPath&personIds=").statusCode()).isEqualTo(200)
        // Selection is a read: invitations and attendance remain unchanged.
        assertThat(admin.queryForObject("select count(*) from forena.invitation where activity_id=? and response='accepted'", Long::class.java, activity)).isEqualTo(4)
        assertThat(admin.queryForObject("select count(*) from forena.attendance_report where activity_id=?", Long::class.java, activity)).isZero()
        val current = json.readTree(request(base).body()).get("revision").asString()
        for (threshold in listOf(-1, 11)) assertThat(request(base, json.writeValueAsString(mapOf("revision" to current, "enabled" to true, "metrics" to metrics, "threshold" to threshold))).statusCode()).isEqualTo(400)
    }
    @Test fun `player evaluation is private revision checked and destructively disabled in one transaction`() {
        val team = managedTeam()
        rosterMember(child1)
        rosterMember(child2)
        val base = "/api/teams/$team/player-evaluation"
        val metric = UUID.randomUUID()
        val indicator = UUID.randomUUID()
        fun configure(revision: String?, enabled: Boolean = true, confirm: Boolean = false, kind: String = "ability") = json.writeValueAsString(mapOf(
            "revision" to revision, "enabled" to enabled, "confirmDeletion" to confirm,
            "defaultGroups" to 2, "threshold" to 7,
            "metrics" to listOf(mapOf("id" to metric, "name" to "Teknik", "kind" to kind), mapOf("id" to indicator, "name" to "Driv", "kind" to "development"))))
        assertThat(json.readTree(request(base).body()).get("enabled").asBoolean()).isFalse()
        assertThat(json.readTree(request("/api/teams/$team/read-views").body()).size()).isZero()
        var response = request(base, configure(null))
        assertThat(response.statusCode()).withFailMessage(response.body()).isEqualTo(200)
        val first = json.readTree(response.body()).get("revision").asString()
        fun scores(revision: String, value: Double = 0.0, person: UUID = child1) = json.writeValueAsString(mapOf("revision" to revision,
            "scores" to listOf(mapOf("personId" to person, "metricId" to metric, "value" to value))))
        for (value in listOf(-1.0, 11.0, 7.5)) assertThat(request("$base/scores", scores(first, value)).statusCode()).isEqualTo(400)
        assertThat(request("$base/scores", scores(first, person = UUID.randomUUID())).statusCode()).isEqualTo(400)
        response = request("$base/scores", scores(first))
        assertThat(response.statusCode()).withFailMessage(response.body()).isEqualTo(200)
        val second = json.readTree(response.body()).get("revision").asString()
        assertThat(request("$base/scores", scores(first, 10.0)).statusCode()).isEqualTo(409)
        assertThat(json.readTree(request(base).body()).get("scores").single().get("value").asDouble()).isZero()
        // A leader without any management permission can read/write scores, but cannot configure.
        admin.update("delete from forena.organization_member where organization_id=? and subject=?", organization, parent)
        rosterMember(own, "leader")
        assertThat(request(base).statusCode()).isEqualTo(200)
        assertThat(request(base, configure(second)).statusCode()).isEqualTo(403)
        response = request("$base/scores", scores(second, 10.0))
        assertThat(response.statusCode()).withFailMessage(response.body()).isEqualTo(200)
        val third = json.readTree(response.body()).get("revision").asString()
        admin.update("delete from forena.team_membership where team_id=? and role='leader'", team)
        assertThat(request(base).statusCode()).isEqualTo(403)
        assertThat(request("$base/scores", scores(third)).statusCode()).isEqualTo(403)
        assertThat(request("/api/teams/$team/read-views").body()).isEqualTo("[]")
        admin.update("insert into forena.organization_member(organization_id,subject,role) values(?,?,'admin')", organization, parent)
        assertThat(request(base, configure(third, enabled = false)).statusCode()).isEqualTo(400)
        assertThat(json.readTree(request(base).body()).get("enabled").asBoolean()).isTrue()
        assertThat(request(base, configure(third, enabled = false, confirm = true)).statusCode()).isEqualTo(200)
        assertThat(admin.queryForObject("select count(*) from forena.player_evaluation_score where team_id=?", Long::class.java, team)).isZero()
        assertThat(request("$base/scores", scores(third)).statusCode()).isEqualTo(403)
        assertThat(request(base, configure(null)).statusCode()).isEqualTo(200)
        assertThat(json.readTree(request(base).body()).get("scores").size()).isZero()
        assertThat(request("$base/scores", scores(third)).statusCode()).isEqualTo(409)
        assertThat(admin.queryForObject("select count(*) from forena.team_membership where team_id=?", Long::class.java, team)).isEqualTo(3)
    }
    @Autowired lateinit var events: org.springframework.context.ApplicationEventPublisher
    @Autowired lateinit var scheduledInvitations: se.forena.api.activities.ScheduledInvitationService
    @Autowired lateinit var capabilityRuntime: se.forena.api.extensions.CapabilityRuntime
    @Autowired lateinit var capabilityWorker: se.forena.api.extensions.CapabilityWorker
    @Autowired lateinit var informationWorker: se.forena.api.extensions.InformationWorker
    @Autowired lateinit var informationService: se.forena.api.extensions.InformationService

    private fun informationFixture(report: Boolean = true): UUID {
        val team = managedTeam()
        val section = UUID.randomUUID()
        admin.update("insert into forena.section(id,organization_id,name,discipline_key) values(?,?,'Fotboll','football')", section, organization)
        admin.update("update forena.team set section_id=? where id=?", section, team)
        rosterMember(own, "leader", start="current_date-1")
        admin.update("update forena.activity set activity_type_id='00000000-0000-4000-8000-000000000002',starts_at=now()-interval '2 hours',ends_at=now()-interval '1 hour' where id=?", activity)
        if (report) assertThat(request(attendancePath(), attendanceBody(present=listOf(child1,child2))).statusCode()).isEqualTo(204)
        return team
    }

    @Test fun `match numbers snapshot the right team membership and preserve overrides and missing values`() {
        val team = informationFixture(false)
        rosterMember(child1, "participant", start = "current_date-1")
        rosterMember(child2, "participant", start = "current_date-1")
        fun membership(number: Int, revision: Int) = request("/api/discipline-fields",
            """{"teamId":"$team","scope":"teamMembership","personId":"$child1","disciplineKey":"football","version":"1.0.0","revision":$revision,"values":{"shirtNumber":$number}}""")
        assertThat(membership(7, 0).statusCode()).isEqualTo(200)
        val created = request("/api/activities", activityBody(team,
            ""","activityTypeId":"00000000-0000-4000-8000-000000000002","invitationMode":"now","personIds":["$child1","$child2"]"""), method = "POST")
        assertThat(created.statusCode()).withFailMessage(created.body()).isEqualTo(201)
        val id = UUID.fromString(json.readTree(created.body()).get("activity").get("id").asString())
        fun snapshot(person: UUID) = json.readTree(request("/api/discipline-fields?teamId=$team&scope=activityParticipation&activityId=$id&personId=$person").body())
        assertThat(snapshot(child1).get("values").get("shirtNumber").asInt()).isEqualTo(7)
        assertThat(snapshot(child2).get("values").has("shirtNumber")).isFalse()
        assertThat(membership(9, 1).statusCode()).isEqualTo(200)
        assertThat(snapshot(child1).get("values").get("shirtNumber").asInt()).isEqualTo(7)
        val saved = request("/api/discipline-fields",
            """{"teamId":"$team","scope":"activityParticipation","activityId":"$id","personId":"$child1","disciplineKey":"football","version":"1.0.0","revision":1,"values":{"shirtNumber":12}}""")
        assertThat(saved.statusCode()).withFailMessage(saved.body()).isEqualTo(200)
        // Re-evaluation after invitation changes must not refresh either an override or an empty snapshot.
        TransactionTemplate(transactionManager).executeWithoutResult { events.publishEvent(se.forena.api.extensionapi.DisciplineParticipantsAdded(id)) }
        assertThat(snapshot(child1).get("values").get("shirtNumber").asInt()).isEqualTo(12)
        assertThat(snapshot(child2).get("values").has("shirtNumber")).isFalse()
        assertThat(request("/api/discipline-fields?teamId=$team&scope=activityParticipation&activityId=$id&personId=$child1", cookie=loginCookie(outsider)).statusCode()).isEqualTo(403)
    }

    @Test fun `scheduled player invitations copy the membership number when materialized`() {
        val team = informationFixture(false)
        rosterMember(child1, "participant", start = "current_date-1")
        val membership = request("/api/discipline-fields",
            """{"teamId":"$team","scope":"teamMembership","personId":"$child1","disciplineKey":"football","version":"1.0.0","revision":0,"values":{"shirtNumber":8}}""")
        assertThat(membership.statusCode()).isEqualTo(200)
        val created = request("/api/activities", activityBody(team,
            ""","activityTypeId":"00000000-0000-4000-8000-000000000002","invitationMode":"schedule","invitationAudience":"players""""), method = "POST")
        assertThat(created.statusCode()).withFailMessage(created.body()).isEqualTo(201)
        val id = UUID.fromString(json.readTree(created.body()).get("activity").get("id").asString())
        admin.update("update forena.activity_schedule set due_at=now()-interval '1 minute',next_attempt=now()-interval '1 minute' where activity_id=? and kind='invitation'", id)
        scheduledInvitations.materialize(System.nanoTime() + java.time.Duration.ofSeconds(30).toNanos())
        val response = request("/api/discipline-fields?teamId=$team&scope=activityParticipation&activityId=$id&personId=$child1")
        assertThat(response.statusCode()).withFailMessage(response.body()).isEqualTo(200)
        val snapshot = json.readTree(response.body())
        assertThat(snapshot.get("values").get("shirtNumber").asInt()).isEqualTo(8)
    }

    private fun informationBody(captain: UUID? = child1, recipients: List<UUID>? = listOf(child1), revision: Int = 0,
        attendance: String? = null): String = json.writeValueAsString(mapOf(
            "answers" to listOf(mapOf("ownerKey" to "actualCaptain", "revision" to revision,
                "values" to if(captain==null) emptyMap<String,String>() else mapOf("actualCaptainPersonId" to captain.toString())),
                mapOf("ownerKey" to "greenCard", "revision" to revision,
                    "values" to if(recipients==null) mapOf("outcome" to "none") else mapOf("outcome" to "awarded","recipientIds" to recipients.map { it.toString() }))),
            "attendance" to attendance?.let { json.readTree(it) }))

    @Test fun `information requires actual attendance distinguishes unknown from none and protects internal fields`() {
        val team = informationFixture(report=false)
        val path = "/api/activities/$activity/follow-up"
        assertThat(request("/api/teams/$team/capabilities", """{"key":"greenCard","enabled":true,"revision":0}""").statusCode()).isEqualTo(200)
        assertThat(request(path,informationBody()).statusCode()).isEqualTo(409)
        assertThat(request(attendancePath(),attendanceBody(present=listOf(child1,child2))).statusCode()).isEqualTo(204)
        assertThat(request(path,informationBody(captain=null,recipients=null)).statusCode()).isEqualTo(200)
        val partial=json.readTree(request(path).body()).get("contributions")
        assertThat(partial.single { it.get("definition").get("key").asString()=="actualCaptain" }.get("state").asString()).isEqualTo("open")
        assertThat(partial.single { it.get("definition").get("key").asString()=="greenCard" }.get("state").asString()).isEqualTo("answered")
        assertThat(request(path,informationBody(captain=other,revision=1)).statusCode()).isEqualTo(400)
        assertThat(request(path,informationBody(recipients=listOf(child1,child2),revision=1)).statusCode()).isEqualTo(200)
        assertThat(request(path,informationBody(revision=1)).statusCode()).isEqualTo(409)
        assertThat(request(path,cookie=loginCookie(outsider)).statusCode()).isEqualTo(403)
        admin.update("update forena.organization_member set active=false where organization_id=?",organization)
        admin.update("update forena.team_membership set active=false where team_id=? and role='leader'",team)
        assertThat(request(path).statusCode()).isEqualTo(403)
        assertThat(request("/api/teams/$team/follow-up-report?from=2000-01-01T00:00:00Z&until=2040-01-01T00:00:00Z").statusCode()).isEqualTo(403)
    }

    @Test fun `information and attendance corrections are atomic and standalone removals cannot orphan outcomes`() {
        val team=informationFixture()
        assertThat(request("/api/teams/$team/capabilities","""{"key":"greenCard","enabled":true,"revision":0}""").statusCode()).isEqualTo(200)
        val path="/api/activities/$activity/follow-up"
        assertThat(request(path,informationBody()).statusCode()).isEqualTo(200)
        assertThat(request(attendancePath(),attendanceBody(1,present=listOf(child2))).statusCode()).isEqualTo(409)
        val stale=attendanceBody(0,present=listOf(child2))
        assertThat(request(path,informationBody(child2,listOf(child2),1,stale)).statusCode()).isEqualTo(409)
        assertThat(json.readTree(request(attendancePath()).body()).get("revision").asInt()).isEqualTo(1)
        assertThat(json.readTree(request(path).body()).get("contributions").first().get("revision").asInt()).isEqualTo(1)
        assertThat(request(path,informationBody(child2,listOf(child2),1,attendanceBody(1,present=listOf(child2)))).statusCode()).isEqualTo(200)
        assertThat(json.readTree(request(attendancePath()).body()).get("revision").asInt()).isEqualTo(2)
        val corrected=json.readTree(request(path).body())
        assertThat(corrected.get("contributions").all { it.get("revision").asInt()==2 }).isTrue()
        assertThat(corrected.get("history").size()).isEqualTo(4)
    }

    @Test fun `information background requests deduplicate and disabled contributions preserve history without closing captain`() {
        val team=informationFixture()
        assertThat(request("/api/teams/$team/capabilities","""{"key":"greenCard","enabled":true,"revision":0}""").statusCode()).isEqualTo(200)
        admin.update("update forena.team_capability set enabled_at=now()-interval '3 hours' where team_id=?",team)
        admin.update("insert into forena.discipline_activity_job(activity_id,team_id,due_at) values(?,?,now()-interval '1 hour')",activity,team)
        informationService.process(activity)
        informationWorker.runDue(100)
        informationWorker.runDue(100)
        assertThat(admin.queryForObject("select count(*) from forena.discipline_information where activity_id=?",Long::class.java,activity)).isEqualTo(2)
        assertThat(admin.queryForObject("select count(*) from forena.extension_notification where activity_id=?",Long::class.java,activity)).isEqualTo(1)
        assertThat(request("/api/teams/$team/capabilities","""{"key":"greenCard","enabled":false,"revision":1}""").statusCode()).isEqualTo(200)
        val contributions=json.readTree(request("/api/activities/$activity/follow-up").body()).get("contributions")
        assertThat(contributions.single { it.get("definition").get("key").asString()=="greenCard" }.get("closeReason").asString()).isEqualTo("capability_disabled")
        assertThat(contributions.single { it.get("definition").get("key").asString()=="actualCaptain" }.get("state").asString()).isEqualTo("open")
        assertThat(request("/api/teams/$team/capabilities","""{"key":"greenCard","enabled":true,"revision":2}""").statusCode()).isEqualTo(200)
        informationWorker.runDue(100)
        assertThat(admin.queryForObject("select count(*) from forena.extension_notification where activity_id=?",Long::class.java,activity)).isEqualTo(1)
        val snapshot=json.readTree(request("/api/activities/$activity/follow-up").body())
        val answers=snapshot.get("contributions").toList().map { mapOf("ownerKey" to it.get("definition").get("key").asString(),"revision" to it.get("revision").asLong(),"values" to emptyMap<String,String>()) }
        assertThat(request("/api/activities/$activity/follow-up",json.writeValueAsString(mapOf("answers" to answers))).statusCode()).isEqualTo(200)
    }

    @Test fun `information is shared by current team leaders and rejects absent duplicate and guardian outcomes`() {
        val team=informationFixture()
        admin.update("update forena.team_membership set active=false where person_id=? and role='leader'",own)
        assertThat(request("/api/activities/$activity/follow-up").statusCode()).isEqualTo(403)
        assertThat(request("/api/teams/$team/capabilities").statusCode()).isEqualTo(200)
        admin.update("update forena.team_membership set active=true where person_id=? and role='leader'",own)
        admin.update("update forena.organization_member set active=false where organization_id=?",organization)
        rosterMember(other,"leader",start="current_date-1")
        admin.update("delete from forena.invitation where activity_id=? and person_id=?",activity,other)
        admin.update("update forena.activity set starts_at=now()-interval '2 days',ends_at=now()-interval '1 day' where id=?",activity)
        admin.update("update forena.team_membership set starts_on=current_date where person_id=? and role='leader'",other)
        val leaderCookie=loginCookie(outsider)
        assertThat(request("/api/activities/$activity",cookie=leaderCookie).statusCode()).isEqualTo(200)
        val path="/api/activities/$activity/follow-up"
        assertThat(request(path,cookie=leaderCookie).statusCode()).isEqualTo(200)
        assertThat(request(path,"""{"answers":[{"ownerKey":"actualCaptain","revision":0,"values":{"actualCaptainPersonId":"$child1"}}]}""",cookie=leaderCookie).statusCode()).isEqualTo(200)
        assertThat(json.readTree(request(path).body()).get("contributions").single().get("values").get("actualCaptainPersonId").asString()).isEqualTo(child1.toString())
        assertThat(request(path,"""{"answers":[{"ownerKey":"actualCaptain","revision":1,"values":{"actualCaptainPersonId":"$other"}}]}""").statusCode()).isEqualTo(400)
        assertThat(request("/api/teams/$team/capabilities","""{"key":"greenCard","revision":0,"enabled":true}""",cookie=leaderCookie).statusCode()).isEqualTo(403)
        admin.update("update forena.team_membership set active=false where person_id=? and role='leader'",own)
        assertThat(request(path).statusCode()).isEqualTo(403)
        assertThat(request("/api/teams/$team/discipline-players").statusCode()).isEqualTo(200)
        assertThat(request("/api/teams/$team/signals").statusCode()).isEqualTo(403)
    }

    @Test fun `capability snapshots deduplicate closest checkpoints and signals resolve dismiss and recur`() {
        val team=informationFixture(false)
        rosterMember(child1,"participant",start="current_date-1")
        rosterMember(child2,"participant",start="current_date-1")
        val type="00000000-0000-4000-8000-000000000002"
        val defaults="""{"scope":"team","scopeId":"$team","activityTypeId":"$type","revision":0,"values":{"capabilities":{"targetTeamSize":{"notificationsEnabled":true,"notificationHours":[72,24]}}}}"""
        assertThat(request("/api/activity-defaults",defaults).statusCode()).isEqualTo(200)
        val created=request("/api/activities",activityBody(team,""","activityTypeId":"$type","invitationMode":"now","personIds":["$child1","$child2"]"""),method="POST")
        assertThat(created.statusCode()).withFailMessage(created.body()).isEqualTo(201)
        val id=UUID.fromString(json.readTree(created.body()).get("activity").get("id").asString())
        val fields="""{"teamId":"$team","scope":"activity","activityId":"$id","disciplineKey":"football","version":"1.0.0","revision":1,"values":{"targetTeamSize":10}}"""
        assertThat(request("/api/discipline-fields",fields).statusCode()).isEqualTo(200)
        admin.update("update forena.activity set starts_at=now()+interval '20 hours',ends_at=now()+interval '22 hours' where id=?",id)
        capabilityRuntime.process(id)
        capabilityRuntime.process(id)
        assertThat(admin.queryForObject("select count(*) from forena.capability_checkpoint where activity_id=?",Long::class.java,id)).isEqualTo(1)
        assertThat(admin.queryForObject("select hours from forena.capability_checkpoint where activity_id=?",Int::class.java,id)).isEqualTo(24)
        assertThat(admin.queryForObject("select count(*) from forena.extension_notification where activity_id=?",Long::class.java,id)).isEqualTo(1)
        var row=json.readTree(request("/api/teams/$team/signals").body()).single { it.get("activityId").asString()==id.toString() }
        val signalId=row.get("id").asString()
        assertThat(row.get("state").asString()).isEqualTo("active")
        assertThat(request("/api/signals/$signalId/actions","""{"revision":${row.get("revision").asLong()},"action":"dismiss"}""",method="POST").statusCode()).isEqualTo(200)
        capabilityRuntime.process(id)
        assertThat(admin.queryForObject("select state from forena.capability_signal where id=?",String::class.java,UUID.fromString(signalId))).isEqualTo("dismissed")
        admin.update("update forena.invitation set response='accepted',responded_at=now() where activity_id=?",id)
        admin.update("update forena.discipline_value set values_json='{\"targetTeamSize\":1}' where activity_id=? and scope='activity'",id)
        capabilityRuntime.process(id)
        assertThat(admin.queryForObject("select state from forena.capability_signal where id=?",String::class.java,UUID.fromString(signalId))).isEqualTo("resolved")
        admin.update("update forena.invitation set response='pending',responded_at=null where activity_id=?",id)
        capabilityRuntime.process(id)
        row=json.readTree(request("/api/teams/$team/signals").body()).single { it.get("id").asString()==signalId }
        assertThat(row.get("state").asString()).isEqualTo("active")
        assertThat(row.get("episode").asLong()).isEqualTo(2)
        assertThat(row.get("history").size()).isEqualTo(1)
        assertThat(request("/api/teams/$team/signals",cookie=loginCookie(outsider)).statusCode()).isEqualTo(403)
        admin.update("update forena.activity set imported=true where id=?",id)
        capabilityRuntime.process(id)
        assertThat(admin.queryForObject("select state from forena.capability_signal where id=?",String::class.java,UUID.fromString(signalId))).isEqualTo("resolved")
        assertThat(admin.queryForObject("select count(*) from forena.extension_notification where activity_id=?",Long::class.java,id)).isEqualTo(1)
    }

    @Test @EnabledIfEnvironmentVariable(named="FORENA_M09_BROWSER_TEST",matches="true")
    fun `information browser saves shared match outcomes through real Spring and PostgreSQL`() {
        val team=informationFixture()
        assertThat(request("/api/teams/$team/capabilities","""{"key":"greenCard","revision":0,"enabled":true}""").statusCode()).isEqualTo(200)
        val process=ProcessBuilder("node","scripts/migration/information-browser.mjs")
            .directory(Path.of("..").toFile()).redirectErrorStream(true)
            .redirectOutput(Path.of("target/information-browser.log").toFile())
        process.environment().putAll(mapOf(
            "FORENA_M09_API" to "http://127.0.0.1:${environment.getRequiredProperty("local.server.port")}",
            "FORENA_M09_EMAIL" to "$parent@example.invalid", "FORENA_INFORMATION_ACTIVITY" to activity.toString(),
            "FORENA_INFORMATION_PLAYER" to child1.toString()))
        val child=process.start()
        if(!child.waitFor(180,SECONDS)) { child.destroyForcibly();error("Information browser timed out") }
        assertThat(child.exitValue()).withFailMessage("See target/information-browser.log").isZero()
        assertThat(admin.queryForObject("select count(*) from forena.discipline_information where activity_id=? and state='answered'",Long::class.java,activity)).isEqualTo(2)
    }

    @Test fun `information isolates two matches accepts imported outcomes and reschedules future lifecycle work`() {
        val team=informationFixture()
        val second=UUID.randomUUID()
        admin.update("""insert into forena.activity(id,organization_id,team_id,activity_type_id,title,starts_at,ends_at)
            select ?,organization_id,team_id,activity_type_id,'Andra matchen',starts_at,ends_at from forena.activity where id=?""",second,activity)
        admin.update("""insert into forena.invitation(id,organization_id,activity_id,person_id,activity_role)
            select gen_random_uuid(),organization_id,?,person_id,activity_role from forena.invitation where activity_id=?""",second,activity)
        assertThat(request("/api/activities/$second/attendance",attendanceBody(present=listOf(child1,child2))).statusCode()).isEqualTo(204)
        assertThat(request("/api/teams/$team/capabilities","""{"key":"greenCard","revision":0,"enabled":true}""").statusCode()).isEqualTo(200)
        admin.update("update forena.team_capability set enabled_at=now()-interval '3 hours' where team_id=?",team)
        for(id in listOf(activity,second))admin.update("insert into forena.discipline_activity_job(activity_id,team_id,due_at) values(?,?,now()-interval '1 hour')",id,team)
        informationWorker.runDue(100)
        val pending=json.readTree(request("/api/teams/$team/follow-up").body())
        assertThat(pending.toList().map { it.get("activityId").asString() }).containsExactlyInAnyOrder(activity.toString(),second.toString())
        admin.update("update forena.activity set imported=true where id=?",activity)
        assertThat(request("/api/activities/$activity/follow-up",informationBody(revision=1)).statusCode()).isEqualTo(200)
        val remaining=json.readTree(request("/api/teams/$team/follow-up").body())
        assertThat(remaining.single().get("activityId").asString()).isEqualTo(second.toString())
        val report=json.readTree(request("/api/teams/$team/follow-up-report?from=2000-01-01T00:00:00Z&until=2040-01-01T00:00:00Z").body())
        assertThat(report.get("entries").size()).isEqualTo(2)
        assertThat(report.get("entries").single { it.get("activityId").asString()==activity.toString() }.get("contributions").all { it.get("state").asString()=="answered" }).isTrue()
        val created=request("/api/activities",activityBody(team,""","activityTypeId":"00000000-0000-4000-8000-000000000002""""),method="POST")
        assertThat(created.statusCode()).isEqualTo(201)
        val future=UUID.fromString(json.readTree(created.body()).get("activity").get("id").asString())
        assertThat(request("/api/activities/$future",activityBody(team).replace("17:30:00Z","18:30:00Z")).statusCode()).isEqualTo(200)
        assertThat(admin.queryForObject("select j.due_at=a.ends_at from forena.discipline_activity_job j join forena.activity a on a.id=j.activity_id where a.id=?",Boolean::class.java,future)).isTrue()
        assertThat(request("/api/activities/$future","""{"action":"cancel"}""",method="DELETE").statusCode()).isEqualTo(200)
        assertThat(admin.queryForObject("select state from forena.discipline_activity_job where activity_id=?",String::class.java,future)).isEqualTo("done")
        admin.update("update forena.activity set status='cancelled' where id=?",second)
        TransactionTemplate(transactionManager).executeWithoutResult { informationService.schedule(second) }
        val closed=json.readTree(request("/api/activities/$second/follow-up").body())
        assertThat(closed.get("contributions").all { it.get("closeReason").asString()=="activity_cancelled" }).isTrue()
        assertThat(json.readTree(request("/api/activities/$activity/follow-up").body()).get("contributions").all { it.get("state").asString()=="answered" }).isTrue()
    }

    @Test fun `information never synthesizes open requests for a cancelled match without saved contributions`() {
        val team=informationFixture(false)
        assertThat(request("/api/teams/$team/capabilities","""{"key":"greenCard","enabled":true,"revision":0}""").statusCode()).isEqualTo(200)
        val created=request("/api/activities",activityBody(team,""","activityTypeId":"00000000-0000-4000-8000-000000000002""""),method="POST")
        assertThat(created.statusCode()).isEqualTo(201)
        val id=UUID.fromString(json.readTree(created.body()).get("activity").get("id").asString())
        assertThat(request("/api/activities/$id","""{"action":"cancel"}""",method="DELETE").statusCode()).isEqualTo(200)
        admin.update("update forena.activity set starts_at=now()-interval '2 hours',ends_at=now()-interval '1 hour' where id=?",id)
        val response=request("/api/activities/$id/follow-up")
        assertThat(response.statusCode()).isEqualTo(200)
        val snapshot=json.readTree(response.body())
        assertThat(snapshot.get("editable").asBoolean()).isFalse()
        assertThat(snapshot.get("contributions").size()).isZero()
        assertThat(snapshot.get("history").size()).isZero()
        informationWorker.runDue(100)
        assertThat(admin.queryForObject("select count(*) from forena.discipline_information where activity_id=?",Long::class.java,id)).isZero()
        assertThat(admin.queryForObject("select count(*) from forena.extension_notification where activity_id=?",Long::class.java,id)).isZero()
        assertThat(admin.queryForObject("select state from forena.discipline_activity_job where activity_id=?",String::class.java,id)).isEqualTo("done")
    }

    @Test fun `discipline applicability transitions initialize once and preserve snapshots and checkpoints`() {
        val team=informationFixture(false)
        val matchType="00000000-0000-4000-8000-000000000002"
        val trainingType="00000000-0000-4000-8000-000000000001"
        fun values(revision: Int,target: Int)="""{"teamId":"$team","scope":"team","disciplineKey":"football","version":"1.0.0","revision":$revision,"values":{"gameFormat":"7v7","targetTeamSize":$target}}"""
        fun settings(revision: Int,hours: Int)="""{"scope":"team","scopeId":"$team","activityTypeId":"$matchType","revision":$revision,"values":{"capabilities":{"targetTeamSize":{"notificationsEnabled":true,"notificationHours":[$hours]}}}}"""
        assertThat(request("/api/discipline-fields",values(0,10)).statusCode()).isEqualTo(200)
        assertThat(request("/api/activity-defaults",settings(0,24)).statusCode()).isEqualTo(200)
        val created=request("/api/activities",activityBody(team,""","activityTypeId":"$trainingType""""),method="POST")
        assertThat(created.statusCode()).isEqualTo(201)
        val id=UUID.fromString(json.readTree(created.body()).get("activity").get("id").asString())
        fun change(type: String) = request("/api/activities/$id",activityBody(team,""","activityTypeId":"$type""""))
        val fields="/api/discipline-fields?teamId=$team&scope=activity&activityId=$id"
        assertThat(admin.queryForObject("select count(*) from forena.discipline_value where activity_id=?",Long::class.java,id)).isZero()
        assertThat(admin.queryForObject("select count(*) from forena.activity_capability where activity_id=?",Long::class.java,id)).isZero()
        assertThat(change(matchType).statusCode()).isEqualTo(200)
        val snapshot=json.readTree(request(fields).body())
        assertThat(snapshot.get("values").get("targetTeamSize").asInt()).isEqualTo(10)
        assertThat(snapshot.get("revision").asLong()).isEqualTo(1)
        assertThat(admin.queryForObject("select hours_json from forena.activity_capability where activity_id=?",String::class.java,id)).isEqualTo("[24]")
        val ownValues="""{"teamId":"$team","scope":"activity","activityId":"$id","disciplineKey":"football","version":"1.0.0","revision":1,"values":{"gameFormat":"7v7","targetTeamSize":11}}"""
        assertThat(request("/api/discipline-fields",ownValues).statusCode()).isEqualTo(200)
        admin.update("insert into forena.capability_checkpoint(activity_id,capability_key,hours) values(?,'targetTeamSize',24)",id)
        assertThat(request("/api/discipline-fields",values(1,12)).statusCode()).isEqualTo(200)
        assertThat(request("/api/activity-defaults",settings(1,48)).statusCode()).isEqualTo(200)
        assertThat(change(matchType).statusCode()).isEqualTo(200)
        assertThat(json.readTree(request(fields).body()).get("values").get("targetTeamSize").asInt()).isEqualTo(11)
        assertThat(change(trainingType).statusCode()).isEqualTo(200)
        assertThat(json.readTree(request(fields).body()).get("enabled").asBoolean()).isFalse()
        assertThat(admin.queryForObject("select state from forena.discipline_activity_job where activity_id=?",String::class.java,id)).isEqualTo("done")
        capabilityRuntime.process(id)
        assertThat(admin.queryForObject("select count(*) from forena.capability_signal where activity_id=? and state='active'",Long::class.java,id)).isZero()
        assertThat(change(matchType).statusCode()).isEqualTo(200)
        val restored=json.readTree(request(fields).body())
        assertThat(restored.get("values").get("targetTeamSize").asInt()).isEqualTo(11)
        assertThat(restored.get("revision").asLong()).isEqualTo(2)
        assertThat(admin.queryForObject("select hours_json from forena.activity_capability where activity_id=?",String::class.java,id)).isEqualTo("[24]")
        assertThat(admin.queryForObject("select count(*) from forena.capability_checkpoint where activity_id=?",Long::class.java,id)).isEqualTo(1)
        assertThat(admin.queryForObject("select count(*) from forena.extension_notification where activity_id=?",Long::class.java,id)).isZero()
        assertThat(admin.queryForObject("select count(*) from forena.discipline_value where activity_id=? and scope='activity'",Long::class.java,id)).isEqualTo(1)
    }

    @Test fun `information report defaults to team season and interprets local date filters in club timezone`() {
        val team=informationFixture()
        admin.update("update forena.team set season='2025' where id=?",team)
        admin.update("update forena.organization set time_zone='America/Los_Angeles' where id=?",organization)
        val result=request("/api/teams/$team/information-report")
        assertThat(result.statusCode()).isEqualTo(200)
        val data=json.readTree(result.body())
        assertThat(data.get("fromDate").asString()).isEqualTo("2025-01-01")
        assertThat(data.get("report").get("from").asString()).isEqualTo("2025-01-01T08:00:00Z")
        assertThat(request("/api/teams/$team/information-report?fromDate=2026-10-25&untilDate=2026-10-24").statusCode()).isEqualTo(400)
        assertThat(request("/api/teams/$team/information-report",cookie=loginCookie(outsider)).statusCode()).isEqualTo(403)
    }

    @Test fun `discipline catalogue enforces platform access immutable packages and references`() {
        managedTeam()
        val path="/api/discipline-catalogue"
        assertThat(request(path).statusCode()).isEqualTo(403)
        admin.update("insert into forena.platform_administrator(subject) values(?)",parent)
        assertThat(request(path).statusCode()).isEqualTo(200)
        assertThat(request("$path/disciplines/football","""{"key":"football","name":"Ändrad","category":"sport"}""").statusCode()).isEqualTo(400)
        assertThat(request("$path/disciplines/choir-test","""{"key":"choir-test","name":"Kör","category":"culture"}""").statusCode()).isEqualTo(200)
        val created=request("/api/admin/clubs/$organization/sections","""{"name":"Kör","slug":"kor","disciplineKey":"choir-test"}""",method="POST")
        assertThat(created.statusCode()).isEqualTo(200)
        val section=json.readTree(created.body()).get("id").asString()
        assertThat(request("$path/disciplines/choir-test",method="DELETE").statusCode()).isEqualTo(409)
        assertThat(request("$path/categories/culture",method="DELETE").statusCode()).isEqualTo(409)
        admin.update("insert into forena.section(id,organization_id,name,discipline_key) values(gen_random_uuid(),?,'Allmänt','common')",organization)
        assertThat(request("/api/admin/sections/$section",method="DELETE").statusCode()).isEqualTo(200)
        assertThat(request("$path/disciplines/choir-test",method="DELETE").statusCode()).isEqualTo(200)
        assertThat(request(path,cookie=loginCookie(outsider)).statusCode()).isEqualTo(403)
    }

    @Test fun `activity defaults inherit sparse section and team values with revisions and snapshot scheduling`() {
        val team=managedTeam()
        val section=UUID.randomUUID()
        admin.update("insert into forena.section(id,organization_id,name,discipline_key) values(?,?,'Fotboll','football')",section,organization)
        admin.update("update forena.team set section_id=? where id=?",section,team)
        val type="00000000-0000-4000-8000-000000000002"
        fun defaultsBody(scope: String,id: UUID,revision: Int,values: String)="""{"scope":"$scope","scopeId":"$id","activityTypeId":"$type","revision":$revision,"values":$values}"""
        val sectionValues="""{"duration":"PT60M","invitationRule":"start-2d","options":{"duration":["PT60M","PT90M"]}}"""
        assertThat(request("/api/activity-defaults",defaultsBody("section",section,0,sectionValues)).statusCode()).isEqualTo(200)
        assertThat(request("/api/activity-defaults",defaultsBody("section",section,0,sectionValues)).statusCode()).isEqualTo(409)
        assertThat(request("/api/activity-defaults",defaultsBody("team",team,0,"""{"duration":null,"responseDueRule":"start-3h","reminderRules":[]}""")).statusCode()).isEqualTo(200)
        val snapshot=json.readTree(request("/api/activity-defaults?scope=team&scopeId=$team").body())
        assertThat(snapshot.get("rows").size()).isEqualTo(2)
        assertThat(request("/api/activity-defaults?scope=team&scopeId=$team",cookie=loginCookie(outsider)).statusCode()).isEqualTo(403)
        val created=request("/api/activities",activityBody(team,""","activityTypeId":"$type","invitationMode":"schedule","invitationAudience":"players""""),method="POST")
        assertThat(created.statusCode()).isEqualTo(201)
        val id=UUID.fromString(json.readTree(created.body()).get("activity").get("id").asString())
        assertThat(admin.queryForObject("select response_due_at=starts_at-interval '3 hours' from forena.activity where id=?",Boolean::class.java,id)).isTrue()
        assertThat(admin.queryForObject("select invitation_send_at=starts_at-interval '2 days' from forena.activity where id=?",Boolean::class.java,id)).isTrue()
        assertThat(request("/api/activity-defaults",defaultsBody("section",section,1,"""{"invitationRule":"start-7d"}""")).statusCode()).isEqualTo(200)
        assertThat(admin.queryForObject("select invitation_send_at=starts_at-interval '2 days' from forena.activity where id=?",Boolean::class.java,id)).isTrue()
        assertThat(request("/api/activity-defaults",defaultsBody("team",team,1,"""{"options":{"duration":[]}}""")).statusCode()).isEqualTo(400)
    }
    @org.springframework.test.context.bean.override.mockito.MockitoBean
    lateinit var assistantModel: se.forena.api.assistant.AssistantModel
    @org.springframework.test.context.bean.override.mockito.MockitoBean
    lateinit var telegramClient: se.forena.api.telegram.TelegramClient
    @Autowired lateinit var assistantProfiles: se.forena.api.assistant.AssistantProfileService
    @Autowired lateinit var telegramWebhook: se.forena.api.telegram.TelegramWebhookService
    @Autowired lateinit var assistantActivities: se.forena.api.activities.AssistantActivityService
    @Autowired lateinit var assistant: se.forena.api.assistant.AssistantService
    @Autowired lateinit var assistantProposals: se.forena.api.assistant.AssistantProposalService
    @Autowired lateinit var telegramIdentities: se.forena.api.identity.TelegramIdentityService
    @Autowired lateinit var attendanceService: se.forena.api.activities.AttendanceService
    @Autowired lateinit var assistantIdentity: se.forena.api.identity.AssistantIdentityService
    @Autowired lateinit var telegramRetention: TelegramUpdateRetentionService
    @Autowired lateinit var telegramGroups: TelegramGroupService
    @Autowired lateinit var dutyService: se.forena.api.activities.ActivityDutyService
    @Autowired lateinit var rosterService: se.forena.api.activities.TeamRosterService

    private fun assistantActor() = se.forena.api.identity.Actor(parent, session, "")

    @ParameterizedTest
    @ValueSource(booleans = [false, true])
    fun `Telegram clarification keeps the question and selected team without using the web conversation`(
        clubClarification: Boolean
    ) {
        val team = rosterTeam()
        admin.update("update forena.team set name='F2016' where id=?", team)
        admin.update("update forena.organization set time_zone='Europe/Stockholm' where id=?", organization)
        admin.update("update forena.activity set title='Fyspass F2016', activity_type_id='00000000-0000-4000-8000-000000000001', starts_at=((current_timestamp at time zone 'Europe/Stockholm')::date + time '19:00') at time zone 'Europe/Stockholm', ends_at=((current_timestamp at time zone 'Europe/Stockholm')::date + time '23:59') at time zone 'Europe/Stockholm' where id=?", activity)
        rosterMember(own)
        rosterPermission(permission = "invitation.manage")
        val web = assistant.new(assistantActor())
        admin.update(
            "insert into forena.assistant_message(id,conversation_id,role,sender,content) values(?,?,'user','Du','Separat hemlig webbfråga')",
            UUID.randomUUID(),
            web.id,
        )
        val proof =
            requireNotNull(telegramIdentities.start(parent, true).pairingUrl)
                .substringAfter("?start=")
        val user =
            java.util.concurrent.ThreadLocalRandom.current().nextLong(100, Long.MAX_VALUE - 10)
        val actor = telegramIdentities.actor(telegramIdentities.connect(proof, user, user, 1))
        val conversation = assistant.activeTelegram(actor)
        var turns = 0
        Mockito.`when`(assistantModel.route(anyString())).thenAnswer { invocation ->
            val context = invocation.getArgument<String>(0)
            assertThat(context).doesNotContain("Separat hemlig webbfråga")
            turns++
            if (turns == 1) {
                if (clubClarification) RoutingPlan(listOf(AssistantTarget(organization)))
                else RoutingPlan(clarification = "Vilket lag gäller träningen?")
            } else {
                assertThat(context)
                    .contains(
                        "Vilka kommer på kvällens träning?",
                        "Vilket lag gäller träningen?",
                        "F2016",
                    )
                assertThat(json.readTree(context).path("explicitTeamId").asText())
                    .isEqualTo(team.toString())
                RoutingPlan(listOf(AssistantTarget(organization, activityId = activity)))
            }
        }
        Mockito.`when`(assistantModel.answer(anyString(), anyString())).thenAnswer { invocation ->
            if (turns == 1) return@thenAnswer ModelAnswer("Vilket lag gäller träningen?")
            val context = json.readTree(invocation.getArgument<String>(1))
            assertThat(context.path("question").asText())
                .isEqualTo("Vilka kommer på kvällens träning?\nLag: F2016")
            assertThat(context.path("team").path("teamId").asText()).isEqualTo(team.toString())
            assertThat(context.path("invitationSummary").path("pending").asInt()).isEqualTo(4)
            assertThat(context.path("invitationSummaryScope").asText()).isEqualTo("whole_activity")
            ModelAnswer("| Svar | Antal |\n| --- | --- |\n| Ej svarat | 4 |")
        }
        assistant.send(actor, conversation.id, MessageCommand("Vilka kommer på kvällens träning?")) {}
        val replies = mutableListOf<se.forena.api.assistant.AssistantReply>()
        assistant.send(actor, conversation.id, MessageCommand("F2016")) { replies.add(it) }
        assertThat(replies.filterNot { it.pending }.single().sender).isEqualTo("Klubb")
        assertThat(assistant.view(actor, conversation.id).conversation.teamId).isEqualTo(team)
        verify(assistantModel, times(if (clubClarification) 2 else 1))
            .answer(anyString(), anyString())
        val fresh = assistant.new(actor)
        Mockito.doAnswer { invocation ->
                val context = json.readTree(invocation.getArgument<String>(0))
                assertThat(context.path("conversationHistory").size()).isEqualTo(1)
                assertThat(context.toString())
                    .doesNotContain("Vilka kommer", "Vilket lag gäller")
                assertThat(context.path("explicitTeamId").isNull).isTrue()
                RoutingPlan(clarification = "Vad vill du veta?")
            }
            .`when`(assistantModel)
            .route(anyString())
        assistant.send(actor, fresh.id, MessageCommand("Nytt ämne")) {}
    }

    @ParameterizedTest
    @ValueSource(booleans = [false, true])
    fun `web activity creation preserves requested timing for both editor modes`(recurring: Boolean) {
        val team = rosterTeam()
        rosterMember(own)
        rosterPermission(permission = "activity.manage")
        val actor = assistantActor()
        val conversation = assistant.new(actor)
        Mockito.`when`(assistantModel.route(anyString()))
            .thenReturn(RoutingPlan(listOf(AssistantTarget(organization, team))))
        Mockito.`when`(assistantModel.answer(anyString(), anyString()))
            .thenReturn(ModelAnswer("Granska träningen i formuläret.",
                activityEditor = se.forena.api.assistant.ActivityEditorDraft(team, recurring = recurring, title = "Träning",
                    startTime = java.time.LocalTime.of(16, 15), endTime = java.time.LocalTime.of(17, 15), gatheringMinutesBefore = 15)))
        val replies = mutableListOf<se.forena.api.assistant.AssistantReply>()
        assistant.send(actor, conversation.id, MessageCommand("Skapa en återkommande träning", team)) { replies.add(it) }
        val reply = replies.single { !it.pending }
        assertThat(reply.failed).isFalse()
        assertThat(reply.activityEditor?.teamId).isEqualTo(team)
        assertThat(reply.activityEditor?.recurring).isEqualTo(recurring)
        assertThat(reply.activityEditor?.endTime).isEqualTo(java.time.LocalTime.of(17, 15))
        assertThat(reply.activityEditor?.gatheringMinutesBefore).isEqualTo(15)
        assertThat(reply.proposals).isEmpty()
        assertThat(assistant.view(actor, conversation.id).proposals).isEmpty()
    }

    @ParameterizedTest
    @ValueSource(booleans = [false, true])
    fun `relative training selection rejects a wrong day and ambiguous evening`(ambiguous: Boolean) {
        val team = rosterTeam()
        rosterMember(own)
        rosterPermission(permission = "invitation.manage")
        admin.update("update forena.organization set time_zone='Europe/Stockholm' where id=?", organization)
        admin.update("update forena.activity set title='Fyspass F2016', activity_type_id='00000000-0000-4000-8000-000000000001', starts_at=((current_timestamp at time zone 'Europe/Stockholm')::date + time '19:00') at time zone 'Europe/Stockholm', ends_at=((current_timestamp at time zone 'Europe/Stockholm')::date + time '23:59') at time zone 'Europe/Stockholm' where id=?", activity)
        if (ambiguous) {
            admin.update("insert into forena.activity(id,organization_id,team_id,title,starts_at,ends_at,activity_type_id) select ?,organization_id,team_id,'Annat pass',starts_at,ends_at,activity_type_id from forena.activity where id=?", UUID.randomUUID(), activity)
        } else {
            admin.update("update forena.activity set starts_at=starts_at+interval '1 day',ends_at=ends_at+interval '1 day' where id=?", activity)
        }
        val actor = assistantActor()
        val conversation = assistant.new(actor)
        Mockito.`when`(assistantModel.route(anyString()))
            .thenReturn(RoutingPlan(listOf(AssistantTarget(organization, team, activity))))
        val replies = mutableListOf<se.forena.api.assistant.AssistantReply>()
        assistant.send(actor, conversation.id, MessageCommand("Vilka kommer på kvällens träning?", team, activity)) { replies.add(it) }
        assertThat(replies.single().text).contains("Vilket lag och vilken aktivitet")
        verify(assistantModel, never()).answer(anyString(), anyString())
    }

    @ParameterizedTest
    @ValueSource(booleans = [false, true])
    fun `relative training does not inherit a page activity from tomorrow`(routePageActivity: Boolean) {
        val team = rosterTeam()
        rosterMember(own)
        rosterPermission(permission = "invitation.manage")
        admin.update("update forena.activity set activity_type_id='00000000-0000-4000-8000-000000000001',starts_at=now()+interval '1 day',ends_at=now()+interval '1 day 1 hour' where id=?", activity)
        val actor = assistantActor()
        val conversation = assistant.new(actor)
        Mockito.`when`(assistantModel.route(anyString()))
            .thenReturn(RoutingPlan(listOf(AssistantTarget(organization, team, if (routePageActivity) activity else null))))
        val replies = mutableListOf<se.forena.api.assistant.AssistantReply>()
        assistant.send(actor, conversation.id, MessageCommand("Vilka kommer på kvällens träning?", team, activity)) { replies.add(it) }
        assertThat(replies.single().text).contains("Vilket lag och vilken aktivitet")
        verify(assistantModel, never()).answer(anyString(), anyString())
    }

    @Test
    fun `relative training uses the validated routed activity instead of a different open page`() {
        val team = rosterTeam()
        rosterMember(own)
        rosterPermission(permission = "invitation.manage")
        admin.update("update forena.activity set title='Fyspass',activity_type_id='00000000-0000-4000-8000-000000000001',starts_at=((now() at time zone 'Europe/Stockholm')::date+time '19:00') at time zone 'Europe/Stockholm',ends_at=((now() at time zone 'Europe/Stockholm')::date+time '23:59') at time zone 'Europe/Stockholm' where id=?", activity)
        val tomorrow = UUID.randomUUID()
        admin.update("insert into forena.activity(id,organization_id,team_id,title,starts_at,ends_at) select ?,organization_id,team_id,'Morgondagens pass',starts_at+interval '1 day',ends_at+interval '1 day' from forena.activity where id=?", tomorrow, activity)
        val actor = assistantActor()
        val conversation = assistant.new(actor)
        Mockito.`when`(assistantModel.route(anyString()))
            .thenReturn(RoutingPlan(listOf(AssistantTarget(organization, team, activity))))
        Mockito.`when`(assistantModel.answer(anyString(), anyString())).thenAnswer { invocation ->
            val context = json.readTree(invocation.getArgument<String>(1))
            assertThat(context.path("selectedActivity").path("id").asString()).isEqualTo(activity.toString())
            assertThat(context.path("activityCategories").path(activity.toString()).asString()).isEqualTo("session")
            ModelAnswer("Kvällens fyspass.")
        }
        val replies = mutableListOf<se.forena.api.assistant.AssistantReply>()
        assistant.send(actor, conversation.id, MessageCommand("Vilka kommer på kvällens träning?", team, tomorrow)) { replies.add(it) }
        assertThat(replies.last().failed).isFalse()
        assertThat(replies.last().text).isEqualTo("Kvällens fyspass.")
    }

    @Test
    fun `assistant router history is bounded and excludes clubs without current access`() {
        val actor = assistantActor()
        val conversation = assistant.new(actor)
        val foreign = UUID.randomUUID()
        admin.update("insert into forena.organization(id,name) values(?,'Annan klubb')", foreign)
        for (index in 1..20) {
            admin.update(
                "insert into forena.assistant_message(id,conversation_id,role,sender,content,created_at) values(?,?,'user','Du',?,clock_timestamp()-?*interval '1 second')",
                UUID.randomUUID(),
                conversation.id,
                "Äldre fråga $index",
                30 - index,
            )
        }
        admin.update(
            "insert into forena.assistant_message(id,conversation_id,role,sender,organization_id,content) values(?,?,'assistant','Annan klubb',?,'Historik utan aktuell klubbåtkomst')",
            UUID.randomUUID(),
            conversation.id,
            foreign,
        )
        Mockito.`when`(assistantModel.route(anyString())).thenAnswer { invocation ->
            val context = invocation.getArgument<String>(0)
            assertThat(json.readTree(context).path("conversationHistory").size())
                .isLessThanOrEqualTo(12)
            assertThat(context)
                .doesNotContain("Äldre fråga 1\"", "Historik utan aktuell klubbåtkomst")
            RoutingPlan(clarification = "Vilket lag?")
        }
        assistant.send(actor, conversation.id, MessageCommand("Nästa fråga")) {}
        verify(assistantModel).route(anyString())
    }

    @Test
    fun `naming a team after a completed answer does not repeat the previous question`() {
        admin.update("update forena.team set name='F2016' where id=?", rosterTeam())
        val actor = assistantActor()
        val conversation = assistant.new(actor)
        admin.update(
            "insert into forena.assistant_message(id,conversation_id,role,sender,content,created_at) values(?,?,'user','Du','Förra ämnet',clock_timestamp()-interval '2 seconds')",
            UUID.randomUUID(),
            conversation.id,
        )
        admin.update(
            "insert into forena.assistant_message(id,conversation_id,role,sender,content) values(?,?,'assistant','Förena','Det här är ett avslutat svar.')",
            UUID.randomUUID(),
            conversation.id,
        )
        Mockito.`when`(assistantModel.route(anyString())).thenAnswer { invocation ->
            val context = json.readTree(invocation.getArgument<String>(0))
            assertThat(context.path("question").asString()).isEqualTo("F2016")
            RoutingPlan(clarification = "Vad vill du veta om F2016?")
        }
        assistant.send(actor, conversation.id, MessageCommand("F2016")) {}
    }

    @Test
    fun `activity update admits all required permissions before waiting and rejects the next command`() {
        admin.update("update forena.organization set time_zone='UTC' where id=?", organization)
        val team = rosterTeam()
        rosterMember(own)
        rosterPermission(permission = "activity.manage")
        rosterPermission(permission = "invitation.manage")
        admin.update("delete from forena.invitation where activity_id=?", activity)
        DriverManager.getConnection(database.jdbcUrl, database.username, database.password).use {
            connection ->
            connection.autoCommit = false
            connection
                .prepareStatement("select id from forena.activity where id=? for update")
                .use {
                    it.setObject(1, activity)
                    it.executeQuery().close()
                }
            val command =
                activityBody(team, ""","revision":0,"invitationMode":"now","personIds":["$own"]""")
            val result = CompletableFuture.supplyAsync {
                request("/api/activities/$activity", command)
            }
            try {
                awaitRuntimeLocks(1)
                admin.update(
                    "update forena.team_permission_assignment set active=false where person_id=?",
                    own,
                )
            } finally {
                connection.rollback()
            }
            assertThat(result.get(10, SECONDS).statusCode()).isEqualTo(200)
            assertThat(
                    admin.queryForObject(
                        "select revision from forena.activity where id=?",
                        Long::class.java,
                        activity,
                    )
                )
                .isEqualTo(1L)
            assertThat(
                    admin.queryForObject(
                        "select count(*) from forena.invitation where activity_id=? and person_id=?",
                        Long::class.java,
                        activity,
                        own,
                    )
                )
                .isEqualTo(1)
            assertThat(
                    request("/api/activities/$activity", activityBody(team, ""","revision":1"""))
                        .statusCode()
                )
                .isEqualTo(403)
        }
    }

    @Test
    fun `Telegram group admission requires the linked sender and matching proof before persistence`() {
        val user = (UUID.randomUUID().leastSignificantBits and Long.MAX_VALUE) ushr 2
        val base = user + 100
        val chat = -user
        val bot = 777L
        val proof =
            requireNotNull(telegramIdentities.start(parent, true).pairingUrl)
                .substringAfter("?start=")
        telegramIdentities.connect(proof, user, user, 0)
        val otherProof =
            requireNotNull(telegramIdentities.start(outsider, true).pairingUrl)
                .substringAfter("?start=")
        telegramIdentities.connect(otherProof, user + 1, user + 1, 0)
        rosterPermission()
        val groupProof =
            telegramGroups
                .start(assistantActor(), rosterTeam(), "team")
                .pairingUrl
                .substringAfter("?startgroup=g_")
                .substringBefore('&')
        Mockito.`when`(telegramClient.call(anyString(), anyMap())).thenAnswer { invocation ->
            when (invocation.getArgument<String>(0)) {
                "getMe" -> json.createObjectNode().put("id", bot)
                "getChatMember" ->
                    json
                        .createObjectNode()
                        .put("status", "administrator")
                        .put("can_invite_users", true)
                "createChatInviteLink" ->
                    json
                        .createObjectNode()
                        .put("creates_join_request", true)
                        .put("invite_link", "https://t.me/+synthetic")
                else -> json.createObjectNode().put("message_id", 1)
            }
        }
        fun message(id: Long, sender: Long, text: String) =
            json.readTree(
                """{"update_id":$id,"message":{"from":{"id":$sender},"chat":{"id":$chat,"type":"supergroup"},"text":"$text"}}"""
            )
        telegramWebhook.handle(message(base, user + 1, "/start g_$groupProof"))
        telegramWebhook.handle(message(base + 1, user, "/start g_${"a".repeat(43)}"))
        verifyNoInteractions(telegramClient)
        telegramWebhook.handle(message(base + 2, user, "/start g_$groupProof"))
        assertThat(
                admin.queryForObject(
                    "select team_id from forena.telegram_group where chat_id=?",
                    UUID::class.java,
                    chat,
                )
            )
            .isEqualTo(rosterTeam())
        telegramWebhook.handle(message(base + 3, user, "fri grupptext"))
        telegramWebhook.handle(message(base + 4, user + 2, "/forena"))
        telegramWebhook.handle(message(base + 5, user, "/forena"))
        assertThat(
                admin.queryForObject(
                    "select count(*) from forena.telegram_update where id between ? and ?",
                    Long::class.java,
                    base,
                    base + 5,
                )
            )
            .isEqualTo(2)
        telegramWebhook.handle(
            json.readTree(
                """{"update_id":${base+6},"my_chat_member":{"from":{"id":${user+1}},"chat":{"id":$chat,"type":"supergroup"},"new_chat_member":{"status":"left"}}}"""
            )
        )
        assertThat(
                admin.queryForObject(
                    "select count(*) from forena.telegram_group where chat_id=?",
                    Long::class.java,
                    chat,
                )
            )
            .isZero()
        verifyNoInteractions(assistantModel)
    }

    @Test
    fun `Telegram checks senders and pairing proofs before persisting updates`() {
        val user = (UUID.randomUUID().leastSignificantBits and Long.MAX_VALUE) ushr 2
        val base = user + 1000
        fun message(id: Long, text: String, bot: Boolean = false) =
            json.readTree(
                """{"update_id":$id,"message":{"from":{"id":$user,"is_bot":$bot},"chat":{"id":$user,"type":"private"},"text":"$text"}}"""
            )
        Mockito.`when`(telegramClient.call(anyString(), anyMap()))
            .thenReturn(json.createObjectNode().put("message_id", 1))
        telegramWebhook.handle(message(base, "hej"))
        telegramWebhook.handle(message(base + 1, "/start ${"a".repeat(43)}"))
        telegramWebhook.handle(
            json.readTree(
                """{"update_id":${base+2},"callback_query":{"from":{"id":$user},"message":{"chat":{"id":$user,"type":"private"}},"data":"p:${UUID.randomUUID()}"}}"""
            )
        )
        val expired =
            requireNotNull(telegramIdentities.start(outsider, true).pairingUrl)
                .substringAfter("?start=")
        admin.update(
            "update forena.telegram_pairing set expires_at=now()-interval '1 minute' where subject=?",
            outsider,
        )
        telegramWebhook.handle(message(base + 3, "/start $expired"))
        assertThat(
                admin.queryForObject(
                    "select count(*) from forena.telegram_update where id between ? and ?",
                    Long::class.java,
                    base,
                    base + 10,
                )
            )
            .isZero()
        verifyNoInteractions(telegramClient, assistantModel)

        val proof =
            requireNotNull(telegramIdentities.start(parent, true).pairingUrl)
                .substringAfter("?start=")
        telegramWebhook.handle(message(base + 4, "/start $proof"))
        assertThat(telegramIdentities.connection(user, user)).isNotNull()
        telegramWebhook.handle(message(base + 4, "/start $proof"))
        telegramWebhook.handle(message(base + 5, "/help"))
        telegramWebhook.handle(message(base + 5, "/help"))
        telegramWebhook.handle(message(base + 6, "/help", bot = true))
        admin.update("update forena.account set enabled=false where subject=?", parent)
        telegramWebhook.handle(message(base + 7, "/help"))
        assertThat(
                admin.queryForObject(
                    "select count(*) from forena.telegram_update where id between ? and ?",
                    Long::class.java,
                    base,
                    base + 10,
                )
            )
            .isEqualTo(2)
        verify(telegramClient, times(2)).call(anyString(), anyMap())
        verifyNoInteractions(assistantModel)
    }

    @Test
    fun `Telegram retention prunes all expired states in bounded batches and keeps recent deduplication`() {
        val base = (UUID.randomUUID().leastSignificantBits and Long.MAX_VALUE) ushr 2
        admin.update(
            """insert into forena.telegram_update(id,state,received_at)
            select ?+n,case n%3 when 0 then 'completed' when 1 then 'failed' else 'processing' end,
            now()-interval '8 days' from generate_series(0,1004) n""",
            base,
        )
        admin.update(
            "insert into forena.telegram_update(id,state,received_at) values(?,'completed',now()-interval '6 days')",
            base + 1005,
        )
        assertThat(telegramRetention.purgeExpired()).isEqualTo(1000)
        assertThat(telegramRetention.purgeExpired()).isEqualTo(5)
        assertThat(telegramRetention.purgeExpired()).isZero()
        assertThat(
                admin.queryForObject(
                    "select count(*) from forena.telegram_update where id between ? and ?",
                    Long::class.java,
                    base,
                    base + 1005,
                )
            )
            .isEqualTo(1)
        assertThat(
                admin.queryForObject(
                    "select id from forena.telegram_update where id=?",
                    Long::class.java,
                    base + 1005,
                )
            )
            .isEqualTo(base + 1005)
    }

    @Test
    fun `activity time edits and soft deletion update open duties while completed duties retain history`() {
        val team = managedTeam()
        admin.update("delete from forena.invitation where activity_id=?", activity)
        for (name in listOf("Sekretariat", "Avslutad uppgift")) dutyService.save(
            assistantActor(),
            ActivityDutyCommand(team, listOf(activity), name, 1),
        )
        admin.update(
            "update forena.activity_duty set state='completed' where activity_id=? and name='Avslutad uppgift'",
            activity,
        )
        val completed =
            admin.queryForMap(
                "select starts_at,ends_at,revision from forena.activity_duty where activity_id=? and state='completed'",
                activity,
            )
        assertThat(
                request("/api/activities/$activity", activityBody(team, ""","revision":0"""))
                    .statusCode()
            )
            .isEqualTo(200)
        val open =
            admin.queryForMap(
                "select starts_at,ends_at,revision from forena.activity_duty where activity_id=? and state='open'",
                activity,
            )
        val updated =
            admin.queryForMap("select starts_at,ends_at from forena.activity where id=?", activity)
        assertThat(open["starts_at"]).isEqualTo(updated["starts_at"])
        assertThat(open["ends_at"]).isEqualTo(updated["ends_at"])
        assertThat(open["revision"]).isEqualTo(2L)
        assertThat(
                request(
                        "/api/activities/$activity",
                        """{"action":"delete","revision":1}""",
                        method = "DELETE",
                    )
                    .statusCode()
            )
            .isEqualTo(200)
        assertThat(
                admin.queryForObject(
                    "select state from forena.activity_duty where activity_id=? and name='Sekretariat'",
                    String::class.java,
                    activity,
                )
            )
            .isEqualTo("cancelled")
        assertThat(
                admin.queryForMap(
                    "select starts_at,ends_at,revision from forena.activity_duty where activity_id=? and state='completed'",
                    activity,
                )
            )
            .isEqualTo(completed)
    }

    @Test
    fun `method security scopes live team permissions for web and Telegram actors`() {
        admin.update("update forena.organization set time_zone='UTC' where id=?", organization)
        val actor = assistantActor()
        val team = rosterTeam()
        val otherTeam = UUID.randomUUID()
        admin.update(
            "insert into forena.team(id,organization_id,name) values(?,?,'Annat lag')",
            otherTeam,
            organization,
        )
        assertThat(AopUtils.isAopProxy(dutyService)).isTrue()
        assertThatThrownBy { dutyService.targets(actor, team) }
            .isInstanceOf(AuthorizationDeniedException::class.java)

        // A guardian cannot inherit a child's independent team permission.
        rosterPermission(person = child1, permission = "invitation.manage")
        assertThatThrownBy { dutyService.targets(actor, team) }
            .isInstanceOf(AuthorizationDeniedException::class.java)
        rosterPermission(permission = "invitation.manage")
        assertThatCode { dutyService.targets(actor, team) }.doesNotThrowAnyException()
        assertThatThrownBy { dutyService.targets(actor, otherTeam) }
            .isInstanceOf(AuthorizationDeniedException::class.java)
        assertThatThrownBy { rosterService.snapshot(actor, team) }
            .isInstanceOf(AuthorizationDeniedException::class.java)
        val missingTeam = UUID.randomUUID()
        assertThatThrownBy { rosterService.snapshot(actor, missingTeam) }
            .isInstanceOf(NoSuchElementException::class.java)
        assertThat(request("/api/teams/$missingTeam/activity-editor").statusCode()).isEqualTo(404)

        admin.update(
            "update forena.team_permission_assignment set starts_on=current_date+1 where person_id=?",
            own,
        )
        assertThatThrownBy { dutyService.targets(actor, team) }
            .isInstanceOf(AuthorizationDeniedException::class.java)
        admin.update(
            "update forena.team_permission_assignment set starts_on=current_date-2,ends_on=current_date-1 where person_id=?",
            own,
        )
        assertThatThrownBy { dutyService.targets(actor, team) }
            .isInstanceOf(AuthorizationDeniedException::class.java)
        admin.update(
            "update forena.team_permission_assignment set starts_on=current_date,ends_on=current_date where person_id=?",
            own,
        )

        val proof =
            requireNotNull(telegramIdentities.start(parent, true).pairingUrl)
                .substringAfter("?start=")
        val user = 921_000_000L + (parent.leastSignificantBits and 0xFFFFFF)
        val link = telegramIdentities.connect(proof, user, user, 1)
        val telegramActor = telegramIdentities.actor(link)
        assertThatCode { dutyService.targets(telegramActor, team) }.doesNotThrowAnyException()
        assertThatThrownBy { dutyService.targets(telegramActor, otherTeam) }
            .isInstanceOf(AuthorizationDeniedException::class.java)

        admin.update(
            "update forena.team_permission_assignment set active=false where person_id=?",
            own,
        )
        assertThatThrownBy { dutyService.targets(telegramActor, team) }
            .isInstanceOf(AuthorizationDeniedException::class.java)
        telegramIdentities.disconnect(parent)
        assertThatThrownBy { dutyService.targets(telegramActor, team) }
            .isInstanceOf(BadCredentialsException::class.java)
    }

    @Test
    fun `personal club replies keep profiles private stream partial results and persist selected context`() {
        val actor = assistantActor()
        val second = UUID.randomUUID()
        admin.update("insert into forena.organization(id,name) values(?,'AIK')", second)
        for (org in listOf(organization, second)) admin.update(
            "insert into forena.organization_member(organization_id,subject,role) values(?,?,'admin')",
            org,
            parent,
        )
        assistantProfiles.save(
            actor,
            organization,
            se.forena.api.assistant.AssistantProfile(
                "UIK-boten",
                instructions = "UIK:s privata caférutin",
            ),
        )
        assistantProfiles.save(
            actor,
            second,
            se.forena.api.assistant.AssistantProfile(
                "AIK-boten",
                instructions = "AIK:s privata planbokning",
            ),
        )
        val conversation = assistant.new(actor)
        org.mockito.Mockito.`when`(assistantModel.route(org.mockito.ArgumentMatchers.anyString()))
            .thenReturn(
                se.forena.api.assistant.RoutingPlan(
                    listOf(
                        se.forena.api.assistant.AssistantTarget(
                            organization,
                            question = "Hur fungerar caféet?",
                        ),
                        se.forena.api.assistant.AssistantTarget(
                            second,
                            question = "Hur bokar jag planen?",
                        ),
                    )
                )
            )
        val contexts = java.util.concurrent.ConcurrentLinkedQueue<String>()
        org.mockito.Mockito.`when`(
                assistantModel.answer(
                    org.mockito.ArgumentMatchers.anyString(),
                    org.mockito.ArgumentMatchers.anyString(),
                )
            )
            .thenAnswer { invocation ->
                val context = invocation.getArgument<String>(1)
                contexts.add(context)
                if (context.contains("AIK:s privata planbokning")) {
                    assertThat(context)
                        .doesNotContain("UIK:s privata caférutin", "Hur fungerar caféet?")
                    throw IllegalStateException("Synthetic unavailable provider")
                }
                assertThat(context)
                    .doesNotContain("AIK:s privata planbokning", "Hur bokar jag planen?")
                se.forena.api.assistant.ModelAnswer("UIK:s café är öppet.")
            }
        val replies = mutableListOf<se.forena.api.assistant.AssistantReply>()
        assistant.send(
            actor,
            conversation.id,
            se.forena.api.assistant.MessageCommand(
                "Hur fungerar caféet i UIK och planbokningen i AIK?"
            ),
        ) {
            replies.add(it)
        }
        assertThat(contexts).hasSize(2)
        assertThat(replies.count { it.pending }).isEqualTo(2)
        assertThat(replies.any { it.sender == "UIK-boten" && !it.failed && !it.pending }).isTrue()
        assertThat(
                replies.any {
                    it.organizationId == second && it.failed && it.text.contains("ofullständig")
                }
            )
            .isTrue()
        assertThat(assistant.view(actor, conversation.id).messages.count { it.role == "assistant" })
            .isEqualTo(3)
    }

    @Test
    fun `authenticated browser streams a model reply and persists the same private conversation`() {
        org.mockito.Mockito.`when`(assistantModel.route(org.mockito.ArgumentMatchers.anyString()))
            .thenReturn(se.forena.api.assistant.RoutingPlan())
        org.mockito.Mockito.`when`(
                assistantModel.answer(
                    org.mockito.ArgumentMatchers.anyString(),
                    org.mockito.ArgumentMatchers.anyString(),
                )
            )
            .thenReturn(se.forena.api.assistant.ModelAnswer("Verifierat syntetiskt svar"))
        val created = request("/api/assistant/conversations", "{}", method = "POST")
        val id = json.readTree(created.body()).get("id").asString()
        val result =
            request(
                "/api/assistant/conversations/$id/messages",
                """{"text":"Hjälp mig förstå översikten"}""",
                method = "POST",
            )
        assertThat(result.statusCode()).isEqualTo(200)
        assertThat(result.headers().firstValue("content-type").orElse(""))
            .contains("application/x-ndjson")
        assertThat(result.body()).contains("Verifierat syntetiskt svar")
        assertThat(
                json
                    .readTree(request("/api/assistant/conversations/$id").body())
                    .get("messages")
                    .size()
            )
            .isEqualTo(2)
    }

    @Test
    fun `private Telegram text reuses the shared assistant and duplicate updates never run a second model call`() {
        val answer = "Verifierat Telegram-svar\n| Svar | Antal |\n| --- | --- |\n| Kommer | 12 |"
        val user =
            java.util.concurrent.ThreadLocalRandom.current().nextLong(100, Long.MAX_VALUE - 10)
        val proof =
            requireNotNull(telegramIdentities.start(parent, true).pairingUrl)
                .substringAfter("?start=")
        telegramIdentities.connect(proof, user, user, 1)
        org.mockito.Mockito.`when`(assistantModel.route(org.mockito.ArgumentMatchers.anyString()))
            .thenReturn(se.forena.api.assistant.RoutingPlan())
        org.mockito.Mockito.`when`(
                assistantModel.answer(
                    org.mockito.ArgumentMatchers.anyString(),
                    org.mockito.ArgumentMatchers.anyString(),
                )
            )
            .thenReturn(se.forena.api.assistant.ModelAnswer(answer))
        org.mockito.Mockito.`when`(
                telegramClient.call(
                    org.mockito.ArgumentMatchers.anyString(),
                    org.mockito.ArgumentMatchers.anyMap<String, Any?>(),
                )
            )
            .thenAnswer { invocation ->
                val arguments = invocation.getArgument<Map<String, Any?>>(1)
                val body = json.readTree(json.writeValueAsString(arguments))
                assertThat(body.path("text").asString()).startsWith("Förena\n\nVerifierat Telegram-svar")
                assertThat(body.path("entities").path(0).path("type").asString()).isEqualTo("pre")
                json.createObjectNode().put("message_id", 1)
            }
        val update =
            json.readTree(
                """{"update_id":$user,"message":{"from":{"id":$user},"chat":{"id":$user,"type":"private"},"text":"Hjälp mig"}}"""
            )
        telegramWebhook.handle(update)
        telegramWebhook.handle(update)
        org.mockito.Mockito.verify(assistantModel, org.mockito.Mockito.times(1))
            .answer(
                org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.anyString(),
            )
        val conversation = assistant.list(assistantActor()).single { it.channel == "telegram" }
        assertThat(assistant.view(assistantActor(), conversation.id).messages.last().content)
            .isEqualTo(answer)
    }

    @Test
    fun `chat yes never confirms a memory and a separate button is still necessary`() {
        val actor = assistantActor()
        val conversation = assistant.new(actor)
        org.mockito.Mockito.`when`(assistantModel.route(org.mockito.ArgumentMatchers.anyString()))
            .thenReturn(se.forena.api.assistant.RoutingPlan())
        org.mockito.Mockito.`when`(
                assistantModel.answer(
                    org.mockito.ArgumentMatchers.anyString(),
                    org.mockito.ArgumentMatchers.anyString(),
                )
            )
            .thenReturn(
                se.forena.api.assistant.ModelAnswer(
                    "Granska minnet.",
                    memory = se.forena.api.assistant.MemoryDraft(content = "Korta svar."),
                )
            )
        assistant.send(
            actor,
            conversation.id,
            se.forena.api.assistant.MessageCommand("Kom ihåg att jag vill ha korta svar"),
        ) {}
        assistant.send(actor, conversation.id, se.forena.api.assistant.MessageCommand("ja")) {}
        assertThat(
                admin.queryForObject(
                    "select count(*) from forena.assistant_memory where subject=?",
                    Long::class.java,
                    parent,
                )
            )
            .isZero()
        val state = assistant.view(actor, conversation.id)
        assertThat(state.proposals.count { it.state == "invalid" }).isEqualTo(1)
        assertThat(state.proposals.count { it.state == "pending" }).isEqualTo(1)
    }

    @Test
    fun `Telegram group text and voice never reach the model and overlong private voice is rejected`() {
        val user = java.util.concurrent.ThreadLocalRandom.current().nextLong(1, Long.MAX_VALUE)
        val proof =
            requireNotNull(telegramIdentities.start(parent, true).pairingUrl)
                .substringAfter("?start=")
        telegramIdentities.connect(proof, user, user, 1)
        org.mockito.Mockito.`when`(
                telegramClient.call(
                    org.mockito.ArgumentMatchers.anyString(),
                    org.mockito.ArgumentMatchers.anyMap<String, Any?>(),
                )
            )
            .thenReturn(json.createObjectNode().put("message_id", 1))
        for (index in 0..1) {
            val update =
                json.readTree(
                    """{"update_id":${user-index},"message":{"from":{"id":$user},"chat":{"id":-55,"type":"supergroup"},"text":"alla är här","voice":{"duration":10}}}"""
                )
            telegramWebhook.handle(update)
        }
        telegramWebhook.handle(
            json.readTree(
                """{"update_id":${user+1},"message":{"from":{"id":$user},"chat":{"id":$user,"type":"private"},"voice":{"duration":61,"file_id":"synthetic","file_size":10}}}"""
            )
        )
        org.mockito.Mockito.verifyNoInteractions(assistantModel)
        assertThat(
                admin.queryForObject(
                    "select count(*) from forena.attendance_report where activity_id=?",
                    Long::class.java,
                    activity,
                )
            )
            .isZero()
    }

    @Test
    fun `memory administration rejects other accounts and stale edits`() {
        val actor = assistantActor()
        val conversation = assistant.new(actor)
        val draft =
            assistantProposals
                .preview(
                    actor,
                    conversation,
                    null,
                    se.forena.api.assistant.ModelAnswer(
                        "Förslag",
                        memory = se.forena.api.assistant.MemoryDraft(content = "Korta svar"),
                    ),
                )
                .single()
        assistantProposals.confirm(actor, draft.id)
        val memory =
            admin.queryForObject(
                "select id from forena.assistant_memory where subject=?",
                UUID::class.java,
                parent,
            )
        assertThat(
                request(
                        "/api/assistant/memories/$memory",
                        """{"revision":1,"content":"Annan text"}""",
                        cookie = loginCookie(outsider),
                    )
                    .statusCode()
            )
            .isEqualTo(403)
        assertThat(
                request(
                        "/api/assistant/memories/$memory",
                        """{"revision":1,"content":"Ändrad text"}""",
                    )
                    .statusCode()
            )
            .isEqualTo(200)
        assertThat(
                request(
                        "/api/assistant/memories/$memory",
                        """{"revision":1,"content":"Gammal version"}""",
                    )
                    .statusCode()
            )
            .isEqualTo(409)
        assertThat(
                request("/api/assistant/memories/$memory?revision=2", method = "DELETE")
                    .statusCode()
            )
            .isEqualTo(200)
    }

    @Test
    fun `assistant conversations are private across direct HTTP reads deletion and new channels`() {
        val response = request("/api/assistant/conversations", "{}", method = "POST")
        assertThat(response.statusCode()).isEqualTo(200)
        val id = json.readTree(response.body()).get("id").asString()
        assertThat(
                request("/api/assistant/conversations/$id", cookie = loginCookie(outsider))
                    .statusCode()
            )
            .isEqualTo(404)
        assertThat(
                request(
                        "/api/assistant/conversations/$id",
                        method = "DELETE",
                        cookie = loginCookie(outsider),
                    )
                    .statusCode()
            )
            .isEqualTo(404)
        assertThat(request("/api/assistant/conversations/$id").statusCode()).isEqualTo(200)
        assertThat(request("/api/assistant/conversations/$id", method = "DELETE").statusCode())
            .isEqualTo(200)
        assertThat(request("/api/assistant/conversations/$id").statusCode()).isEqualTo(404)
    }

    @Test
    fun `a memory draft requires separate confirmation is account bound and is applied at most once`() {
        val actor = assistantActor()
        val conversation = assistant.new(actor)
        val answer =
            se.forena.api.assistant.ModelAnswer(
                "Granska minnesförslaget",
                memory = se.forena.api.assistant.MemoryDraft(content = "Jag föredrar korta svar."),
            )
        val draft = assistantProposals.preview(actor, conversation, null, answer).single()
        assertThat(
                admin.queryForObject(
                    "select count(*) from forena.assistant_memory where created_by=?",
                    Long::class.java,
                    parent,
                )
            )
            .isZero()
        assertThat(
                request(
                        "/api/assistant/proposals/${draft.id}/confirm",
                        method = "POST",
                        cookie = loginCookie(outsider),
                    )
                    .statusCode()
            )
            .isEqualTo(404)
        assertThat(
                request("/api/assistant/proposals/${draft.id}/confirm", method = "POST")
                    .statusCode()
            )
            .isEqualTo(200)
        assertThat(
                request("/api/assistant/proposals/${draft.id}/confirm", method = "POST")
                    .statusCode()
            )
            .isEqualTo(200)
        assertThat(
                admin.queryForObject(
                    "select count(*) from forena.assistant_memory where created_by=?",
                    Long::class.java,
                    parent,
                )
            )
            .isEqualTo(1)
        assistant.new(actor)
        assertThat(
                request("/api/assistant/proposals/${draft.id}/confirm", method = "POST")
                    .statusCode()
            )
            .isEqualTo(409)
    }

    @Test
    fun `Telegram pairing uses a hashed expiring one time proof and reconnect never revives old actors`() {
        val state = telegramIdentities.start(parent, true)
        val url = requireNotNull(state.pairingUrl)
        val proof = url.substringAfter("?start=")
        assertThat(proof.length).isEqualTo(43)
        assertThat(
                admin.queryForList(
                    "select fingerprint from forena.telegram_pairing where subject=?",
                    String::class.java,
                    parent,
                )
            )
            .doesNotContain(proof)
        val user = java.util.concurrent.ThreadLocalRandom.current().nextLong(1, Long.MAX_VALUE)
        val link = telegramIdentities.connect(proof, user, user, 1)
        val actor = telegramIdentities.actor(link)
        assertThatThrownBy { telegramIdentities.connect(proof, user, user, 2) }
            .isInstanceOf(
                org.springframework.security.authentication.BadCredentialsException::class.java
            )
        val conversation = assistant.activeTelegram(actor)
        val webConversation = assistant.new(assistantActor())
        assertThat(assistant.activeTelegram(actor).id).isEqualTo(conversation.id)
        assertThat(webConversation.id).isNotEqualTo(conversation.id)
        telegramIdentities.disconnect(parent)
        assertThatThrownBy { telegramIdentities.actor(link) }
            .isInstanceOf(
                org.springframework.security.authentication.BadCredentialsException::class.java
            )
        val newProof =
            requireNotNull(telegramIdentities.start(parent, true).pairingUrl)
                .substringAfter("?start=")
        val reconnected = telegramIdentities.connect(newProof, user, user, 3)
        assertThat(reconnected.id).isNotEqualTo(link.id)
        assertThatThrownBy { telegramIdentities.actor(link) }
            .isInstanceOf(
                org.springframework.security.authentication.BadCredentialsException::class.java
            )
        assertThat(assistant.activeTelegram(telegramIdentities.actor(reconnected)).id)
            .isNotEqualTo(conversation.id)
    }

    @Test
    fun `own age groups use only the linked self profile and keep child ages out of adult tone`() {
        val service = assistantIdentity
        for ((age, expected) in
            listOf(12 to "under13", 13 to "13to17", 17 to "13to17", 18 to "adult")) {
            admin.update(
                "update forena.person set birth_date=current_date-make_interval(years=>?) where id=?",
                age,
                own,
            )
            assertThat(service.viewer(assistantActor(), organization, null).ageGroup)
                .isEqualTo(expected)
        }
        admin.update("update forena.person set birth_date=null where id=?", own)
        admin.update(
            "update forena.person set birth_date=current_date-interval '12 years' where id=?",
            child1,
        )
        assertThat(service.viewer(assistantActor(), organization, null).ageGroup)
            .isEqualTo("unknown")
    }

    @Autowired lateinit var contextSessions: se.forena.api.identity.SessionService

    @ParameterizedTest
    @ValueSource(
        strings = ["team_administrator", "section_administrator", "club_administrator", "guardian"]
    )
    fun `custom membership names never become administrative or guardian assignments`(
        role: String
    ) {
        val team = rosterTeam()
        rosterMember(own, role)
        val viewer = assistantIdentity.viewer(assistantActor(), organization, team)
        assertThat(viewer.roles).containsExactly("membership:$role")
        assertThat(viewer.roleAssignments.single().role).isEqualTo(role)
        assertThat(viewer.roleAssignments.single().source).isEqualTo(AssistantRoleSource.MEMBERSHIP)
    }

    @Test
    fun `real administration and identically named membership remain distinct until administration is revoked`() {
        val team = rosterTeam()
        rosterMember(own, "team_administrator")
        val access = UUID.randomUUID()
        admin.update(
            "insert into forena.team_access_assignment(id,organization_id,team_id,person_id,starts_on) values(?,?,?,?,current_date)",
            access,
            organization,
            team,
            own,
        )
        admin.update(
            "insert into forena.team_administrator(organization_id,team_id,subject,person_id,access_assignment_id,starts_on) values(?,?,?,?,?,current_date)",
            organization,
            team,
            parent,
            own,
            access,
        )
        val viewer = assistantIdentity.viewer(assistantActor(), organization, team)
        assertThat(viewer.roles)
            .containsExactlyInAnyOrder("membership:team_administrator", "team_administrator")
        assertThat(viewer.roleAssignments.map { it.role })
            .containsExactly("team_administrator", "team_administrator")
        assertThat(viewer.roleAssignments.map { it.source })
            .containsExactlyInAnyOrder(
                AssistantRoleSource.MEMBERSHIP,
                AssistantRoleSource.TEAM_ADMINISTRATION,
            )
        admin.update("update forena.team_administrator set active=false where subject=?", parent)
        val revoked = assistantIdentity.viewer(assistantActor(), organization, team)
        assertThat(revoked.roles).containsExactly("membership:team_administrator")
        assertThat(revoked.roleAssignments.single().source)
            .isEqualTo(AssistantRoleSource.MEMBERSHIP)
    }

    @Test
    fun `Telegram and web share current leader guardian and administrator role assignments`() {
        val team = rosterTeam()
        rosterMember(own, "leader")
        rosterMember(own, "coach")
        rosterMember(child1)
        rosterMember(child2, "leader")
        val access = UUID.randomUUID()
        admin.update(
            "insert into forena.team_access_assignment(id,organization_id,team_id,person_id,starts_on) values(?,?,?,?,current_date)",
            access,
            organization,
            team,
            own,
        )
        admin.update(
            "insert into forena.team_administrator(organization_id,team_id,subject,person_id,access_assignment_id,starts_on) values(?,?,?,?,?,current_date)",
            organization,
            team,
            parent,
            own,
            access,
        )
        val proof =
            requireNotNull(telegramIdentities.start(parent, true).pairingUrl)
                .substringAfter("?start=")
        val user = java.util.concurrent.ThreadLocalRandom.current().nextLong(1, Long.MAX_VALUE)
        val actor = telegramIdentities.actor(telegramIdentities.connect(proof, user, user, 1))
        val viewer = assistantIdentity.viewer(actor, organization, team)
        assertThat(viewer).isEqualTo(assistantIdentity.viewer(assistantActor(), organization, team))
        assertThat(viewer.roles)
            .containsExactlyInAnyOrder(
                "membership:leader",
                "membership:coach",
                "guardian",
                "team_administrator",
            )
        assertThat(viewer.roleAssignments).allSatisfy { assignment ->
            assertThat(assignment.teamId).isEqualTo(team)
            assertThat(assignment.organizationId).isEqualTo(organization)
        }

        // Roles are read again after pairing; the child's leader membership never becomes ours.
        admin.update(
            "update forena.team_membership set starts_on=current_date-2,ends_on=current_date-1 where person_id=? and team_id=?",
            own,
            team,
        )
        admin.update(
            "update forena.team_administrator set starts_on=current_date-2,ends_on=current_date-1 where subject=?",
            parent,
        )
        assertThat(assistantIdentity.viewer(actor, organization, team).roles)
            .containsExactly("guardian")
    }

    @Test
    fun `assistant roles remain scoped to each team and administrative section`() {
        val team = rosterTeam()
        val otherTeam = UUID.randomUUID()
        val section = UUID.randomUUID()
        admin.update(
            "insert into forena.section(id,organization_id,name) values(?,?,'Sektion')",
            section,
            organization,
        )
        admin.update("update forena.team set section_id=? where id=?", section, team)
        admin.update(
            "insert into forena.team(id,organization_id,name) values(?,?,'Annat lag')",
            otherTeam,
            organization,
        )
        rosterMember(child1)
        admin.update(
            "insert into forena.team_membership(organization_id,team_id,person_id,role,starts_on) values(?,?,?,'leader',current_date)",
            organization,
            otherTeam,
            own,
        )
        admin.update(
            "insert into forena.section_administrator(organization_id,section_id,subject) values(?,?,?)",
            organization,
            section,
            parent,
        )
        assertThat(assistantIdentity.viewer(assistantActor(), organization, team).roles)
            .containsExactlyInAnyOrder("guardian", "section_administrator")
        assertThat(assistantIdentity.viewer(assistantActor(), organization, otherTeam).roles)
            .containsExactly("membership:leader")
        assertThat(assistantIdentity.viewer(assistantActor(), organization, null).roles)
            .containsExactlyInAnyOrder("membership:leader", "guardian", "section_administrator")
        admin.update(
            "insert into forena.organization_member(organization_id,subject,role) values(?,?,'admin')",
            organization,
            parent,
        )
        assertThat(assistantIdentity.viewer(assistantActor(), organization, otherTeam).roles)
            .containsExactlyInAnyOrder("membership:leader", "club_administrator")
        admin.update("update forena.section_administrator set active=false where subject=?", parent)
        admin.update("update forena.organization_member set active=false where subject=?", parent)
        assertThat(assistantIdentity.viewer(assistantActor(), organization, team).roles)
            .containsExactly("guardian")
    }

    @Test
    fun `assistant routing and club answer receive verified concurrent roles despite old chat claims`() {
        val team = rosterTeam()
        rosterMember(own, "leader")
        rosterMember(child1)
        val actor = assistantActor()
        val conversation = assistant.new(actor)
        admin.update(
            "insert into forena.assistant_message(id,conversation_id,role,sender,content) values(?,?,'assistant','Förena','Du är bara målsman.')",
            UUID.randomUUID(),
            conversation.id,
        )
        Mockito.`when`(assistantModel.route(anyString())).thenAnswer { invocation ->
            val viewer = json.readTree(invocation.getArgument<String>(0)).path("viewer")
            assertThat(viewer.path("roles").asSequence().map { it.asString() }.toList())
                .contains("membership:leader", "guardian")
            assertThat(
                    viewer
                        .path("roleAssignments")
                        .asSequence()
                        .map { it.path("teamId").asString() }
                        .toList()
                )
                .contains(team.toString())
            RoutingPlan(listOf(AssistantTarget(organization, teamId = team)))
        }
        Mockito.`when`(assistantModel.answer(anyString(), anyString())).thenAnswer { invocation ->
            val viewer = json.readTree(invocation.getArgument<String>(1)).path("viewer")
            assertThat(viewer.path("roles").asSequence().map { it.asString() }.toList())
                .contains("membership:leader", "guardian")
            ModelAnswer("Du är både ledare och målsman i laget.")
        }
        assistant.send(actor, conversation.id, MessageCommand("Vilka roller har jag i Lag?")) {}
        verify(assistantModel).route(anyString())
        verify(assistantModel).answer(anyString(), anyString())
    }

    @Test
    fun `expired pairing and foreign private chat cannot create a Telegram link`() {
        val proof =
            requireNotNull(telegramIdentities.start(parent, true).pairingUrl)
                .substringAfter("?start=")
        val user = java.util.concurrent.ThreadLocalRandom.current().nextLong(1, Long.MAX_VALUE - 1)
        assertThatThrownBy { telegramIdentities.connect(proof, user, user + 1, 1) }
            .isInstanceOf(IllegalArgumentException::class.java)
        admin.update(
            "update forena.telegram_pairing set expires_at=now()-interval '1 second' where subject=?",
            parent,
        )
        assertThatThrownBy { telegramIdentities.connect(proof, user, user, 2) }
            .isInstanceOf(
                org.springframework.security.authentication.BadCredentialsException::class.java
            )
        assertThat(telegramIdentities.connectionForSubject(parent)).isNull()
    }

    @Test
    fun `a partial attendance proposal preserves unknown people and invitation responses and rejects stale revisions`() {
        rosterPermission(permission = "attendance.manage")
        admin.update(
            "update forena.activity set starts_at=now()-interval '1 hour',ends_at=now()+interval '1 hour' where id=?",
            activity,
        )
        val actor = assistantActor()
        attendanceService.patch(actor, activity, 0, mapOf(child1 to true))
        val state = attendanceService.snapshot(actor, activity)
        assertThat(state.roster.single { it.personId == child1 }.present).isTrue()
        assertThat(state.roster.single { it.personId == child2 }.present).isNull()
        assertThat(
                admin.queryForObject(
                    "select response from forena.invitation where id=?",
                    String::class.java,
                    invitation,
                )
            )
            .isEqualTo("pending")
        assertThatThrownBy { attendanceService.patch(actor, activity, 0, mapOf(child1 to false)) }
            .isInstanceOf(IllegalStateException::class.java)
        assertThat(attendanceService.snapshot(actor, activity).revision).isEqualTo(1)
    }
    @Test fun `assistant reads invitation-purpose activities without inheriting activity management`() {
        val team = rosterTeam()
        rosterPermission(permission="invitation.manage")
        admin.update("delete from forena.invitation where activity_id=? and person_id<>?",activity,other)
        val actor = assistantActor()
        assertThat(request("/api/activities/$activity").statusCode()).isEqualTo(404)
        val visible = assistantActivities.catalogActivities(actor)
        assertThat(visible.map { it.id }).contains(activity)
        assertThat(assistantActivities.activity(actor,activity).can_manage_activities).isFalse()
        assertThat(request("/api/teams/$team/activity-editor").statusCode()).isEqualTo(403)
    }

    @Test
    fun `team purpose permissions never disclose another team in the same club`() {
        val otherTeam = UUID.randomUUID()
        val otherActivity = UUID.randomUUID()
        admin.update(
            "insert into forena.team(id,organization_id,name) values(?,?,'Skyddat lag')",
            otherTeam,
            organization,
        )
        admin.update(
            "insert into forena.activity(id,organization_id,team_id,title,starts_at,ends_at) values(?,?,?,'Skyddad lagaktivitet',now()+interval '1 hour',now()+interval '2 hours')",
            otherActivity,
            organization,
            otherTeam,
        )
        val month =
            admin.queryForObject(
                "select to_char(now() at time zone 'Europe/Stockholm','YYYY-MM')",
                String::class.java,
            )
        val actor = assistantActor()
        for (permission in
            listOf("invitation.manage", "roster.manage", "assistant.memory.manage")) {
            rosterPermission(permission = permission)
            for (path in listOf("/api/me/overview", "/api/me/calendar?month=$month")) {
                val response = request(path)
                assertThat(response.statusCode()).isEqualTo(200)
                assertThat(response.body())
                    .doesNotContain(
                        otherTeam.toString(),
                        otherActivity.toString(),
                        "Skyddad lagaktivitet",
                    )
            }
            assertThat(request("/api/activities/$otherActivity").statusCode()).isEqualTo(404)
            assertThat(assistantActivities.catalogTeams(actor).map { it.id })
                .contains(rosterTeam())
                .doesNotContain(otherTeam)
            assertThat(assistantActivities.catalogActivities(actor).map { it.id })
                .doesNotContain(otherActivity)
            assertThatThrownBy { assistantActivities.team(actor, otherTeam) }
                .isInstanceOf(AccessDeniedException::class.java)
            assertThatThrownBy { assistantActivities.activity(actor, otherActivity) }
                .isInstanceOf(NoSuchElementException::class.java)
            admin.update(
                "delete from forena.team_permission_assignment where team_id=? and permission=?",
                rosterTeam(),
                permission,
            )
        }
    }

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
            registry.add("forena.authentication.mail-delay-ms") { 3_600_000 }
            registry.add("forena.email.from") { "auth@example.invalid" }
            registry.add("FORENA_TELEGRAM_ENABLED") { true }
            registry.add("forena.telegram.retention-delay-ms") { 3_600_000 }
            registry.add("forena.disciplines.poll-ms") { 3_600_000 }
            registry.add("FORENA_TELEGRAM_BOT_USERNAME") { "ForenaTestBot" }
            registry.add("forena.web-session.enabled") { true }
            registry.add("forena.web-session.origin") { "https://app.example.invalid" }
            registry.add("forena.web-session.key") { Base64.getEncoder().encodeToString(ByteArray(32) { 7 }) }
        }
    }
    @MockitoSpyBean lateinit var clubRecords: ClubRepository
    @Autowired lateinit var managementRecords: ManagementRepository
    @Autowired lateinit var authMail: AuthMailService
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

    @Test
    fun `discipline packages are selected by section with validated versioned values and independent snapshots`() {
        val team = managedTeam()
        val section = UUID.randomUUID()
        admin.update("insert into forena.section(id,organization_id,name,discipline_key) values(?,?,'Fotboll','football')", section, organization)
        admin.update("update forena.team set section_id=? where id=?", section, team)
        val catalogue = request("/api/disciplines")
        assertThat(catalogue.statusCode()).isEqualTo(200)
        assertThat(catalogue.body()).contains("\"key\":\"football\"", "\"key\":\"common\"")
        val path = "/api/discipline-fields?teamId=$team&scope=team"
        assertThat(json.readTree(request(path).body()).get("enabled").asBoolean()).isTrue()
        fun body(revision: Int, values: String, version: String = "1.0.0") =
            """{"teamId":"$team","scope":"team","disciplineKey":"football","version":"$version","revision":$revision,"values":$values}"""
        val values = """{"gameFormat":"7v7","targetTeamSize":10,"periods":3}"""
        assertThat(request("/api/discipline-fields", body(0, values)).statusCode()).isEqualTo(200)
        assertThat(request("/api/discipline-fields", body(0, "{}")).statusCode()).isEqualTo(409)
        assertThat(request("/api/discipline-fields", body(1, "{}", "9.0.0")).statusCode()).isEqualTo(409)
        assertThat(request("/api/discipline-fields", body(1, """{"targetTeamSize":1.5}""")).statusCode()).isEqualTo(400)
        val created = request("/api/activities", activityBody(team, ""","activityTypeId":"00000000-0000-4000-8000-000000000002""""), method = "POST")
        assertThat(created.statusCode()).isEqualTo(201)
        val id = json.readTree(created.body()).get("activity").get("id").asString()
        val matchPath = "/api/discipline-fields?teamId=$team&scope=activity&activityId=$id"
        assertThat(json.readTree(request(matchPath).body()).get("values")).isEqualTo(json.readTree(values))
        assertThat(request("/api/discipline-fields", body(1, """{"targetTeamSize":12}""")).statusCode()).isEqualTo(200)
        assertThat(json.readTree(request(matchPath).body()).get("values")).isEqualTo(json.readTree(values))
        assertThat(request(path, cookie = loginCookie(outsider)).statusCode()).isEqualTo(403)
    }

    @Test
    fun `discipline properties grant team readers shirt and position without permitting writes or match internals`() {
        val team = rosterTeam()
        val section = UUID.randomUUID()
        admin.update("insert into forena.section(id,organization_id,name,discipline_key) values(?,?,'Fotboll','football')", section, organization)
        admin.update("update forena.team set section_id=? where id=?", section, team)
        rosterMember(child1)
        rosterPermission(permission = "roster.manage")
        val body = """{"teamId":"$team","personId":"$child1","scope":"teamMembership","disciplineKey":"football","version":"1.0.0","revision":0,"values":{"shirtNumber":7,"positions":["forward"]}}"""
        assertThat(request("/api/discipline-fields", body).statusCode()).isEqualTo(200)
        admin.update("update forena.team_permission_assignment set active=false where team_id=?", team)
        val read = request("/api/discipline-fields?teamId=$team&personId=$child1&scope=teamMembership")
        assertThat(read.statusCode()).isEqualTo(200)
        val snapshot = json.readTree(read.body())
        assertThat(snapshot.get("editable").asBoolean()).isFalse()
        assertThat(snapshot.get("values").get("shirtNumber").asInt()).isEqualTo(7)
        assertThat(request("/api/discipline-fields", body).statusCode()).isEqualTo(403)
        assertThat(request("/api/discipline-fields?teamId=$team&scope=activity&activityId=$activity").statusCode()).isEqualTo(403)
        assertThat(request("/api/discipline-fields?teamId=$team&personId=$child1&scope=teamMembership", cookie = loginCookie(outsider)).statusCode()).isEqualTo(403)
    }

    @Test
    fun `activity capacity serializes concurrent acceptances preserves existing answers and excludes leaders`() {
        admin.update("update forena.activity set max_participants=1 where id=?", activity)
        val second = admin.queryForObject("select id from forena.invitation where activity_id=? and person_id=?", UUID::class.java, activity, child2)
        val paths = listOf("/api/invitations/$invitation/respond", "/api/invitations/$second/respond")
        val cookie = loginCookie()
        val results = paths.map { path -> CompletableFuture.supplyAsync { request(path, """{"response":"accepted"}""", cookie).statusCode() } }
            .map { it.get(20, SECONDS) }
        assertThat(results).containsExactlyInAnyOrder(200, 409)
        val winner = paths[results.indexOf(200)]
        val loser = paths[results.indexOf(409)]
        assertThat(request(winner, """{"response":"accepted"}""").statusCode()).isEqualTo(200)
        admin.update("update forena.invitation set activity_role='leader' where activity_id=? and person_id=?", activity, own)
        val leader = admin.queryForObject("select id from forena.invitation where activity_id=? and person_id=?", UUID::class.java, activity, own)
        assertThat(request("/api/invitations/$leader/respond", """{"response":"accepted"}""").statusCode()).isEqualTo(200)
        assertThat(request(winner, """{"response":"pending"}""").statusCode()).isEqualTo(200)
        assertThat(request(loser, """{"response":"accepted"}""").statusCode()).isEqualTo(200)
        val overview = json.readTree(request("/api/me/overview").body()).get("activities").single { it.get("id").asString() == activity.toString() }
        assertThat(overview.get("accepted_participants").asInt()).isEqualTo(1)
        assertThat(overview.get("max_participants").asInt()).isEqualTo(1)
    }

    @Test
    fun `discipline captain candidates stay invitation scoped and hidden values survive planning edits`() {
        val team = rosterTeam()
        val section = UUID.randomUUID()
        admin.update("insert into forena.section(id,organization_id,name,discipline_key) values(?,?,'Fotboll','football')", section, organization)
        admin.update("update forena.team set section_id=? where id=?", section, team)
        admin.update("update forena.activity set activity_type_id='00000000-0000-4000-8000-000000000002' where id=?", activity)
        admin.update("update forena.invitation set response='accepted',responded_at=now(),activity_role='participant' where id=?", invitation)
        rosterPermission(permission = "activity.manage")
        rosterPermission(permission = "invitation.manage")
        fun body(revision: Int, values: String) = """{"teamId":"$team","activityId":"$activity","scope":"activity","disciplineKey":"football","version":"1.0.0","revision":$revision,"values":$values}"""
        assertThat(request("/api/discipline-fields", body(0, """{"captainPersonId":"$child1","captainSource":"acceptedActivityPlayers"}""")).statusCode()).isEqualTo(200)
        admin.update("update forena.team_permission_assignment set active=false where permission='invitation.manage' and team_id=?", team)
        val path = "/api/discipline-fields?teamId=$team&scope=activity&activityId=$activity"
        val hidden = json.readTree(request(path).body())
        assertThat(hidden.get("values").has("captainPersonId")).isFalse()
        assertThat(hidden.get("acceptedPlayers").isEmpty).isTrue()
        assertThat(request("/api/discipline-fields", body(1, """{"captainPersonId":"$child1"}""")).statusCode()).isEqualTo(403)
        assertThat(request("/api/discipline-fields", body(1, """{"venue":"away"}""")).statusCode()).isEqualTo(200)
        admin.update("update forena.team_permission_assignment set active=true where permission='invitation.manage' and team_id=?", team)
        assertThat(json.readTree(request(path).body()).get("values").get("captainPersonId").asString()).isEqualTo(child1.toString())
        admin.update("update forena.invitation set response='declined' where id=?", invitation)
        assertThat(request("/api/discipline-fields", body(2, """{"captainPersonId":"$child1"}""")).statusCode()).isEqualTo(400)
        assertThat(request("/api/discipline-fields", body(2, """{"venue":"home"}""")).statusCode()).isEqualTo(200)
    }

    @Test
    fun `capacity accepts only positive JSON integers and lowering a limit preserves all accepted answers`() {
        val team = managedTeam()
        for (invalid in listOf("0", "-1", "1.5", "\"10\"", "true", "2147483648"))
            assertThat(request("/api/activities", activityBody(team, ",\"maxParticipants\":$invalid"), method = "POST").statusCode())
                .withFailMessage("Invalid capacity accepted: $invalid").isEqualTo(400)
        val second = admin.queryForObject("select id from forena.invitation where activity_id=? and person_id=?", UUID::class.java, activity, child2)
        assertThat(respond("""{"response":"accepted"}""").statusCode()).isEqualTo(200)
        assertThat(request("/api/invitations/$second/respond", """{"response":"accepted"}""").statusCode()).isEqualTo(200)
        assertThat(request("/api/activities/$activity", activityBody(team, ""","maxParticipants":1,"revision":0""")).statusCode()).isEqualTo(200)
        assertThat(admin.queryForObject("select count(*) from forena.invitation where activity_id=? and response='accepted'", Long::class.java, activity)).isEqualTo(2)
        assertThat(respond("""{"response":"accepted"}""").statusCode()).isEqualTo(200)
        val ownInvitation = admin.queryForObject("select id from forena.invitation where activity_id=? and person_id=?", UUID::class.java, activity, own)
        val rejected = request("/api/invitations/$ownInvitation/respond", """{"response":"accepted"}""")
        assertThat(rejected.statusCode()).isEqualTo(409)
        assertThat(rejected.body()).contains("Aktiviteten är full")
        assertThat(request("/api/activities/$activity", activityBody(team, ""","maxParticipants":null,"revision":1""")).statusCode()).isEqualTo(200)
        assertThat(request("/api/invitations/$ownInvitation/respond", """{"response":"accepted"}""").statusCode()).isEqualTo(200)
    }

    @Test
    fun `capacity reads legacy leader roles on the activity date even after membership is deactivated`() {
        rosterMember(own, "leader", start = "current_date-1")
        admin.update("update forena.team_membership set active=false where team_id=? and person_id=?", rosterTeam(), own)
        admin.update("update forena.activity set max_participants=1 where id=?", activity)
        assertThat(respond("""{"response":"accepted"}""").statusCode()).isEqualTo(200)
        val leader = admin.queryForObject("select id from forena.invitation where activity_id=? and person_id=?", UUID::class.java, activity, own)
        assertThat(request("/api/invitations/$leader/respond", """{"response":"accepted"}""").statusCode()).isEqualTo(200)
        val snapshot = json.readTree(request("/api/me/overview").body()).get("activities").single { it.get("id").asString() == activity.toString() }
        assertThat(snapshot.get("accepted_participants").asInt()).isEqualTo(1)
        assertThat(snapshot.get("people").single { it.get("id").asString() == own.toString() }.get("invitation").get("consumes_capacity").asBoolean()).isFalse()
    }

    private fun rosterTeam(): UUID = admin.queryForObject("select team_id from forena.activity where id=?", UUID::class.java, activity)!!
    private fun rosterMember(person: UUID, role: String = "participant", start: String = "current_date", end: String = "null") {
        admin.update("insert into forena.team_membership(organization_id,team_id,person_id,role,starts_on,ends_on) values(?,?,?,?, $start, $end)", organization, rosterTeam(), person, role)
    }
    private fun rosterPermission(person: UUID = own, permission: String = "roster.manage") {
        admin.update("insert into forena.team_permission_assignment(organization_id,team_id,person_id,permission,starts_on) values(?,?,?,?,current_date)", organization, rosterTeam(), person, permission)
    }

    private fun attendancePath() = "/api/activities/$activity/attendance"
    private fun attendanceBody(revision: Int = 0, present: List<UUID> = listOf(own),
                               people: List<UUID> = listOf(own, child1, child2, other), confirm: Boolean = false) =
        json.writeValueAsString(mapOf("revision" to revision, "personIds" to present, "rosterIds" to people, "confirmEmpty" to confirm))
    private fun startAttendance() {
        rosterPermission(permission = "attendance.manage")
        admin.update("update forena.activity set starts_at=now()-interval '1 hour' where id=?", activity)
    }

    @Test fun `attendance requires independent current permission for list history and writes`() {
        rosterMember(own, "leader")
        rosterPermission(permission = "activity.manage")
        admin.update("update forena.invitation set activity_role='leader' where activity_id=? and person_id=?", activity, own)
        assertThat(request(attendancePath()).statusCode()).isEqualTo(403)
        assertThat(request(attendancePath(), attendanceBody()).statusCode()).isEqualTo(403)
        startAttendance()
        assertThat(request(attendancePath()).statusCode()).isEqualTo(200)
        assertThat(request(attendancePath(), cookie = loginCookie(outsider)).statusCode()).isEqualTo(403)
        assertThat(request(attendancePath(), attendanceBody(), loginCookie(outsider)).statusCode()).isEqualTo(403)
        admin.update("update forena.team_permission_assignment set active=false where permission='attendance.manage' and team_id=?", rosterTeam())
        assertThat(request(attendancePath(), attendanceBody()).statusCode()).isEqualTo(403)
    }

    @Test fun `attendance history never uses the account email when the reporter lacks an active display name`() {
        startAttendance()
        admin.update("insert into forena.organization_member(organization_id,subject,role) values(?,?,'admin')", organization, parent)
        admin.update("update forena.person_access set active=false where organization_id=? and subject=? and kind='self'", organization, parent)
        val email = "$parent@example.invalid"

        for (revision in 0..1) {
            if (revision == 1) {
                admin.update("delete from forena.person_access where organization_id=? and subject=? and kind='self'", organization, parent)
            }
            assertThat(request(attendancePath(), attendanceBody(revision)).statusCode()).isEqualTo(204)
            val response = request(attendancePath())
            assertThat(response.statusCode()).isEqualTo(200)
            assertThat(response.body()).doesNotContain(email)
            val history = json.readTree(response.body()).get("history").toList()
            assertThat(history).hasSize(revision + 1)
            assertThat(history.all { it.get("actorName").asString() == "Användare utan visningsnamn" }).isTrue()
        }

        val stored = admin.queryForList("select actor_subject,actor_name from forena.attendance_history where activity_id=?", activity)
        assertThat(stored).hasSize(2)
        assertThat(stored.all { it["actor_subject"] == parent && it["actor_name"] == "Användare utan visningsnamn" }).isTrue()
    }

    @Test fun `attendance assesses all people preserves answers supports corrections and zero with history`() {
        startAttendance()
        val path = attendancePath()
        val initial = json.readTree(request(path).body())
        assertThat(initial.get("revision").asInt()).isZero()
        assertThat(initial.get("roster").all { it.get("present").isNull }).isTrue()
        val answers = admin.queryForList("select id,response,revision from forena.invitation where activity_id=? order by id", activity)
        assertThat(request(path, attendanceBody()).statusCode()).isEqualTo(204)
        assertThat(request(path, attendanceBody()).statusCode()).isEqualTo(409)
        val first = json.readTree(request(path).body())
        assertThat(first.get("roster").count { it.get("present").asBoolean() }).isEqualTo(1)
        assertThat(first.get("history").size()).isEqualTo(1)
        assertThat(first.get("history").get(0).get("changes").size()).isEqualTo(4)
        assertThat(request(path, attendanceBody(1, emptyList())).statusCode()).isEqualTo(400)
        assertThat(request(path, attendanceBody(1, emptyList(), confirm = true)).statusCode()).isEqualTo(204)
        val zero = json.readTree(request(path).body())
        assertThat(zero.get("revision").asInt()).isEqualTo(2)
        assertThat(zero.get("roster").all { !it.get("present").asBoolean() }).isTrue()
        assertThat(zero.get("history").size()).isEqualTo(2)
        assertThat(zero.get("history").get(0).get("actorName").asString()).isEqualTo("Person 0")
        assertThat(zero.get("history").get(0).get("changes").size()).isEqualTo(1)
        assertThat(admin.queryForList("select id,response,revision from forena.invitation where activity_id=? order by id", activity)).isEqualTo(answers)
        admin.update("update forena.activity set starts_at=now()-interval '10 years',ends_at=now()-interval '9 years' where id=?", activity)
        assertThat(request(path, attendanceBody(2)).statusCode()).isEqualTo(204)
        admin.update("update forena.activity set status='cancelled' where id=?", activity)
        assertThat(request(path, attendanceBody(3)).statusCode()).isEqualTo(409)
        val cancelled = json.readTree(request(path).body())
        assertThat(cancelled.get("status").asString()).isEqualTo("cancelled")
        assertThat(cancelled.get("writable").asBoolean()).isFalse()
        assertThat(cancelled.get("revision").asInt()).isEqualTo(3)
    }

    @Test fun `attendance denies writes before start and for cancelled first reports`() {
        rosterPermission(permission = "attendance.manage")
        assertThat(request(attendancePath(), attendanceBody()).statusCode()).isEqualTo(409)
        admin.update("update forena.activity set starts_at=now(),status='cancelled' where id=?", activity)
        assertThat(request(attendancePath(), attendanceBody()).statusCode()).isEqualTo(409)
        assertThat(admin.queryForObject("select count(*) from forena.attendance_report where activity_id=?", Long::class.java, activity)).isZero()
        admin.update("update forena.activity set status='scheduled' where id=?", activity)
        assertThat(request(attendancePath(), attendanceBody()).statusCode()).isEqualTo(204)
    }

    @Test fun `historical attendance includes ended memberships and declined guests once but not later starters`() {
        startAttendance()
        admin.update("delete from forena.invitation where activity_id=? and person_id in (?,?)", activity, own, child2)
        admin.update("update forena.activity set starts_at=now()-interval '10 days',ends_at=now()-interval '9 days' where id=?", activity)
        rosterMember(own, "leader", "current_date-20", "current_date-5")
        admin.update("update forena.team_membership set active=false where team_id=? and person_id=?", rosterTeam(), own)
        rosterMember(child1, start = "current_date-20")
        rosterMember(child2, start = "current_date-2")
        admin.update("update forena.invitation set response='declined',responded_at=now() where activity_id=? and person_id=?", activity, other)
        val roster = json.readTree(request(attendancePath()).body()).get("roster")
        assertThat(roster.toList().map { it.get("personId").asString() }).containsExactlyInAnyOrder(own.toString(), child1.toString(), other.toString())
        assertThat(request(attendancePath(), attendanceBody(people = listOf(own, child1, other))).statusCode()).isEqualTo(204)
        // The assessed list is a persistent snapshot, independent of later membership changes.
        admin.update("delete from forena.team_membership where team_id=?", rosterTeam())
        assertThat(json.readTree(request(attendancePath()).body()).get("roster").size()).isEqualTo(3)
    }

    @Test fun `additional attendance people require same organization and section without creating membership`() {
        startAttendance()
        val section = UUID.randomUUID(); val secondTeam = UUID.randomUUID(); val extra = UUID.randomUUID()
        admin.update("insert into forena.section(id,organization_id,name) values(?,?,'Sektion')", section, organization)
        admin.update("update forena.team set section_id=? where id=?", section, rosterTeam())
        admin.update("insert into forena.team(id,organization_id,section_id,name) values(?,?,?,'Annat lag')", secondTeam, organization, section)
        admin.update("insert into forena.person(id,organization_id,display_name) values(?,?,'Extra medlem')", extra, organization)
        admin.update("insert into forena.team_membership(organization_id,team_id,person_id,role,starts_on) values(?,?,?,'participant',current_date)", organization, secondTeam, extra)
        val all = listOf(own, child1, child2, other, extra)
        assertThat(json.readTree(request(attendancePath()).body()).get("candidates").toList().map { it.get("personId").asString() }).contains(extra.toString())
        assertThat(request(attendancePath(), attendanceBody(present = listOf(extra), people = all)).statusCode()).isEqualTo(204)
        assertThat(admin.queryForObject("select count(*) from forena.team_membership where team_id=?", Long::class.java, rosterTeam())).isZero()
        val foreignPerson = UUID.randomUUID(); val foreignOrg = UUID.randomUUID()
        admin.update("insert into forena.organization(id,name) values(?,'Annan klubb')", foreignOrg)
        admin.update("insert into forena.person(id,organization_id,display_name) values(?,?,'Främmande')", foreignPerson, foreignOrg)
        assertThat(request(attendancePath(), attendanceBody(1, listOf(foreignPerson), all + foreignPerson)).statusCode()).isEqualTo(400)
        val wrongSectionPerson = UUID.randomUUID()
        admin.update("insert into forena.person(id,organization_id,display_name) values(?,?,'Annan sektion')", wrongSectionPerson, organization)
        assertThat(request(attendancePath(), attendanceBody(1, listOf(wrongSectionPerson), all + wrongSectionPerson)).statusCode()).isEqualTo(400)
    }

    @Test fun `simultaneous first attendance reports and stale corrections cannot overwrite each other`() {
        startAttendance()
        for (revision in listOf(0, 1)) {
            val futures = listOf(listOf(own), listOf(child1)).map { present -> CompletableFuture.supplyAsync {
                request(attendancePath(), attendanceBody(revision, present)).statusCode()
            } }
            assertThat(futures.map { it.get(15, SECONDS) }).containsExactlyInAnyOrder(204, 409)
        }
        assertThat(json.readTree(request(attendancePath()).body()).get("history").size()).isEqualTo(2)
    }

    @Test
    fun `attendance keeps admitted permission but checks cancellation after lock wait`() {
        startAttendance()
        for (cancel in listOf(false, true)) {
            admin.update(
                "update forena.team_permission_assignment set active=true where team_id=? and permission='attendance.manage'",
                rosterTeam(),
            )
            DriverManager.getConnection(database.jdbcUrl, database.username, database.password)
                .use { connection ->
                    connection.autoCommit = false
                    connection
                        .prepareStatement("select id from forena.activity where id=? for update")
                        .use {
                            it.setObject(1, activity)
                            it.executeQuery().close()
                        }
                    val result = CompletableFuture.supplyAsync {
                        request(attendancePath(), attendanceBody())
                    }
                    awaitRuntimeLocks(1)
                    if (cancel)
                        connection
                            .prepareStatement(
                                "update forena.activity set status='cancelled' where id=?"
                            )
                            .use {
                                it.setObject(1, activity)
                                it.executeUpdate()
                            }
                    else
                        admin.update(
                            "update forena.team_permission_assignment set active=false where team_id=? and permission='attendance.manage'",
                            rosterTeam(),
                        )
                    connection.commit()
                    assertThat(result.get(10, SECONDS).statusCode())
                        .isEqualTo(if (cancel) 409 else 204)
                }
            if (!cancel)
                assertThat(request(attendancePath(), attendanceBody(1)).statusCode()).isEqualTo(403)
        }
        assertThat(
                admin.queryForObject(
                    "select count(*) from forena.attendance_report where activity_id=?",
                    Long::class.java,
                    activity,
                )
            )
            .isEqualTo(1)
    }

    @Test fun `personal attendance remains unknown without a report and only exposes accessible people`() {
        startAttendance()
        val path = "/api/activities/$activity"
        val initial = json.readTree(request(path).body())
        assertThat(initial.get("people").all { it.get("attendance").asString() == "unknown" }).isTrue()
        assertThat(initial.get("can_manage_activities").asBoolean()).isFalse()
        assertThat(request(attendancePath(), attendanceBody()).statusCode()).isEqualTo(204)
        val people = json.readTree(request(path).body()).get("people").toList()
        assertThat(people.single { it.get("id").asString() == own.toString() }.get("attendance").asString()).isEqualTo("present")
        assertThat(people.single { it.get("id").asString() == child1.toString() }.get("attendance").asString()).isEqualTo("absent")
        assertThat(people.none { it.get("id").asString() == other.toString() }).isTrue()
        // Attendance-only rights allow opening an old activity even without a personal invitation.
        admin.update("delete from forena.invitation where activity_id=? and person_id in (?,?,?)", activity, own, child1, child2)
        assertThat(request(path).statusCode()).isEqualTo(200)
    }

    @Test fun `attendance transaction rolls back first and existing reports after a history failure`() {
        startAttendance()
        fun failHistory() = admin.execute("alter table forena.attendance_change add constraint synthetic_attendance_failure check (person_id <> '$own' and person_id <> '$child1') not valid")
        fun restoreHistory() = admin.execute("alter table forena.attendance_change drop constraint synthetic_attendance_failure")
        failHistory()
        try {
            assertThat(request(attendancePath(), attendanceBody()).statusCode()).isEqualTo(503)
            assertThat(admin.queryForObject("select count(*) from forena.attendance_report where activity_id=?", Long::class.java, activity)).isZero()
            assertThat(admin.queryForObject("select count(*) from forena.attendance_history where activity_id=?", Long::class.java, activity)).isZero()
        } finally { restoreHistory() }
        assertThat(request(attendancePath(), attendanceBody()).statusCode()).isEqualTo(204)
        failHistory()
        try {
            assertThat(request(attendancePath(), attendanceBody(1, listOf(child1))).statusCode()).isEqualTo(503)
            val saved = json.readTree(request(attendancePath()).body())
            assertThat(saved.get("revision").asInt()).isEqualTo(1)
            assertThat(saved.get("history").size()).isEqualTo(1)
            assertThat(saved.get("roster").single { it.get("personId").asString() == own.toString() }.get("present").asBoolean()).isTrue()
        } finally { restoreHistory() }
    }

    @Test @EnabledIfEnvironmentVariable(named = "FORENA_ROSTER_BROWSER_TEST", matches = "true")
    fun `roster browser creates players and leaders and activates the invited account`() {
        rosterPermission()
        val address = "browser-${UUID.randomUUID()}@example.invalid"
        val mailbox = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        mailbox.createContext("/") { exchange ->
            val kind = if (exchange.requestURI.path == "/invite") "roster" else "verify"
            val row = admin.queryForMap("select id,encrypted_link from forena.auth_mail_outbox where recipient=? and kind=? order by expires_at desc limit 1", address, kind)
            val link = browserSettings.decrypt(row["encrypted_link"].toString(), row["id"].toString())
            authMail.deliver()
            val bytes = json.writeValueAsString(mapOf("code" to link.substringAfter("?code="))).toByteArray()
            exchange.responseHeaders.add("Content-Type", "application/json")
            exchange.sendResponseHeaders(200, bytes.size.toLong())
            exchange.responseBody.use { it.write(bytes) }
        }
        mailbox.start()
        try {
            val process = ProcessBuilder("node", "scripts/migration/roster-registration-browser.mjs")
                .directory(Path.of("..").toFile()).redirectErrorStream(true)
                .redirectOutput(Path.of("target/roster-browser.log").toFile())
            process.environment().keys.removeIf { it.startsWith("FORENA_") }
            process.environment().putAll(mapOf(
                "FORENA_ROSTER_API" to "http://127.0.0.1:${environment.getRequiredProperty("local.server.port")}",
                "FORENA_ROSTER_MAILBOX" to "http://127.0.0.1:${mailbox.address.port}",
                "FORENA_ROSTER_EMAIL" to address, "FORENA_ROSTER_ADMIN_EMAIL" to "$parent@example.invalid",
                "FORENA_ROSTER_TEAM" to rosterTeam().toString()))
            val child = process.start()
            if (!child.waitFor(180, SECONDS)) { child.destroyForcibly(); error("See target/roster-browser.log") }
            assertThat(child.exitValue()).withFailMessage("See target/roster-browser.log").isZero()
        } finally { mailbox.stop(0) }
    }

    private fun rosterCreate(name: String = "Ny spelare", role: String = "participant", email: String = "",
                             extra: String = "", requestId: UUID = UUID.randomUUID()) = request(
        "/api/teams/${rosterTeam()}/roster/members",
        """{"requestId":"$requestId","name":"$name","role":"$role","email":"$email"$extra}""", method = "POST")

    private fun rosterInviteCode(person: UUID): String {
        val row = admin.queryForMap("""select m.id,m.encrypted_link from forena.roster_login_invitation i
            join forena.auth_mail_outbox m on m.id=i.mail_id where i.person_id=? and not i.revoked""", person)
        return browserSettings.decrypt(row["encrypted_link"].toString(), row["id"].toString()).substringAfter("?code=")
    }

    @Test fun `roster registration is authorized validates role and retries without duplicates`() {
        assertThat(rosterCreate().statusCode()).isEqualTo(403)
        rosterPermission()
        val id = UUID.randomUUID()
        val first = rosterCreate(role = "leader", requestId = id)
        assertThat(first.statusCode()).withFailMessage(first.body()).isEqualTo(201)
        assertThat(rosterCreate(role = "leader", requestId = id).body()).isEqualTo(first.body())
        val person = UUID.fromString(json.readTree(first.body()).get("personId").asString())
        assertThat(admin.queryForObject("select count(*) from forena.team_membership where person_id=?", Long::class.java, person)).isEqualTo(1)
        assertThat(admin.queryForObject("select count(*) from forena.person_access where person_id=?", Long::class.java, person)).isZero()
        assertThat(admin.queryForObject("select count(*) from forena.team_permission_assignment where person_id=?", Long::class.java, person)).isZero()
        assertThat(rosterCreate(name = "Fel roll", role = "team_admin").statusCode()).isEqualTo(400)
        assertThat(rosterCreate(name = "Fel adress", email = "not-an-email").statusCode()).isEqualTo(400)
        assertThat(rosterCreate(extra = ",\"startsOn\":\"2000-01-01\"").statusCode()).isEqualTo(400)
    }

    @Test fun `roster concurrent registration creates one person and membership`() {
        rosterPermission()
        val id = UUID.randomUUID()
        val attempts = (1..6).map { CompletableFuture.supplyAsync { rosterCreate(requestId = id) } }
        val results = attempts.map { it.get(20, SECONDS) }
        assertThat(results.map { it.statusCode() }).containsOnly(201)
        assertThat(results.map { it.body() }.distinct()).hasSize(1)
        val person = UUID.fromString(json.readTree(results.first().body()).get("personId").asString())
        assertThat(admin.queryForObject("select count(*) from forena.team_membership where person_id=?", Long::class.java, person)).isEqualTo(1)
    }

    @Test fun `roster future membership is saved but not exposed as a current roster member`() {
        rosterPermission()
        val start = LocalDate.now(ZoneId.of("Europe/Stockholm")).plusDays(2)
        val result = rosterCreate(extra = ",\"startsOn\":\"$start\"")
        assertThat(result.statusCode()).isEqualTo(201)
        val person = UUID.fromString(json.readTree(result.body()).get("personId").asString())
        assertThat(request("/api/teams/${rosterTeam()}/roster").body()).doesNotContain(person.toString())
        assertThat(admin.queryForObject("select starts_on from forena.team_membership where person_id=?", Date::class.java, person)?.toLocalDate()).isEqualTo(start)
    }

    @Test fun `roster registration warns about duplicates supports existing people and rejects foreign people`() {
        rosterPermission()
        val matches = request("/api/teams/${rosterTeam()}/roster/candidates?q=Person")
        assertThat(matches.statusCode()).withFailMessage(matches.body()).isEqualTo(200)
        assertThat(matches.body()).contains(own.toString(), child1.toString()).doesNotContain("contactPhone", "password")
        assertThat(rosterCreate(name = "Person 0").statusCode()).isEqualTo(409)
        assertThat(rosterCreate(name = "Person 0", extra = ",\"duplicatesConfirmed\":true").statusCode()).isEqualTo(201)
        val reused = rosterCreate(extra = ",\"personId\":\"$child1\"")
        assertThat(reused.statusCode()).isEqualTo(201)
        assertThat(reused.body()).contains(child1.toString())
        assertThat(rosterCreate(extra = ",\"personId\":\"$child1\"").statusCode()).isEqualTo(409)
        assertThat(rosterCreate(extra = ",\"personId\":\"${UUID.randomUUID()}\"").statusCode()).isEqualTo(404)
    }

    @Test fun `roster invitation keeps membership on mail failure and resending invalidates old links`() {
        rosterPermission()
        val created = rosterCreate(email = "$outsider@example.invalid", extra = ",\"duplicatesConfirmed\":true")
        assertThat(created.statusCode()).withFailMessage(created.body()).isEqualTo(201)
        val person = UUID.fromString(json.readTree(created.body()).get("personId").asString())
        val old = rosterInviteCode(person)
        admin.update("update forena.auth_mail_outbox set attempts=5 where id=(select mail_id from forena.roster_login_invitation where person_id=?)", person)
        assertThat(request("/api/teams/${rosterTeam()}/roster").body()).contains("failed")
        assertThat(admin.queryForObject("select count(*) from forena.team_membership where person_id=?", Long::class.java, person)).isEqualTo(1)
        val path = "/api/teams/${rosterTeam()}/roster/members/$person/invitation"
        assertThat(request(path, """{"email":"$outsider@example.invalid"}""", method = "POST").statusCode()).isEqualTo(429)
        admin.update("update forena.roster_login_invitation set created_at=created_at-interval '2 minutes' where person_id=?", person)
        assertThat(request(path, """{"email":"$outsider@example.invalid"}""", method = "POST").statusCode()).isEqualTo(204)
        assertThat(request("/api/auth/roster-invitation", """{"code":"$old"}""", cookie = null, method = "POST").statusCode()).isEqualTo(404)
        assertThat(admin.queryForObject("select count(*) from forena.team_membership where person_id=?", Long::class.java, person)).isEqualTo(1)
    }

    @Test fun `roster invitation requires the verified recipient explicit acceptance and current inviter rights`() {
        rosterPermission()
        val created = rosterCreate(email = "$outsider@example.invalid", extra = ",\"duplicatesConfirmed\":true")
        val person = UUID.fromString(json.readTree(created.body()).get("personId").asString())
        val code = rosterInviteCode(person)
        val prepare = "/api/auth/roster-invitation"
        val accept = "/api/me/roster-invitation"
        assertThat(request(prepare, """{"code":"$code"}""", method = "POST").statusCode()).isEqualTo(204)
        assertThat(request(accept, "{}", method = "POST").statusCode()).isEqualTo(403)
        val recipient = loginCookie(outsider)
        assertThat(request(prepare, """{"code":"$code"}""", cookie = recipient, method = "POST").statusCode()).isEqualTo(204)
        assertThat(request(accept, cookie = recipient).body()).contains("Ny spelare", "Lag")
        // Queued mail is not proof of a sent invitation.
        assertThat(request(accept, "{}", cookie = recipient, method = "POST").statusCode()).isEqualTo(409)
        admin.update("update forena.auth_mail_outbox set delivered_at=now() where id=(select mail_id from forena.roster_login_invitation where person_id=?)", person)
        admin.update("update forena.team_permission_assignment set active=false where person_id=? and permission='roster.manage'", own)
        assertThat(request(accept, "{}", cookie = recipient, method = "POST").statusCode()).isEqualTo(409)
        admin.update("update forena.team_permission_assignment set active=true where person_id=? and permission='roster.manage'", own)
        admin.update("update forena.account set enabled=false where subject=?", parent)
        assertThat(request(accept, "{}", cookie = recipient, method = "POST").statusCode()).isEqualTo(409)
        admin.update("update forena.account set enabled=true where subject=?", parent)
        admin.update("update forena.roster_login_invitation set expires_at=now()-interval '1 second' where person_id=?", person)
        assertThat(request(accept, "{}", cookie = recipient, method = "POST").statusCode()).isEqualTo(409)
        admin.update("update forena.roster_login_invitation set expires_at=now()+interval '1 day' where person_id=?", person)
        assertThat(request(accept, "{}", cookie = recipient, method = "POST").statusCode()).isEqualTo(200)
        assertThat(admin.queryForObject("select subject from forena.person_access where person_id=? and kind='self'", UUID::class.java, person)).isEqualTo(outsider)
        assertThat(request("/api/me/overview", cookie = recipient).body()).contains(rosterTeam().toString())
        assertThat(request("/api/teams/${rosterTeam()}/roster", cookie = recipient).statusCode()).isEqualTo(403)
        assertThat(request(accept, "{}", cookie = recipient, method = "POST").statusCode()).isEqualTo(404)
    }

    @Test fun `roster invitation survives new account registration verification and session rotation`() {
        rosterPermission()
        val address = "new-${UUID.randomUUID()}@example.invalid"
        val created = rosterCreate(email = address)
        val person = UUID.fromString(json.readTree(created.body()).get("personId").asString())
        val code = rosterInviteCode(person)
        val prepared = request("/api/auth/roster-invitation", """{"code":"$code"}""", cookie = null, method = "POST")
        assertThat(prepared.statusCode()).isEqualTo(204)
        val browser = prepared.headers().allValues("set-cookie").single { it.startsWith(browserSettings.cookieName + "=") }.substringBefore(';')
        assertThat(request("/api/auth/register", """{"email":"$address","password":"synthetic-new-password"}""", cookie = browser, method = "POST").statusCode()).isEqualTo(200)
        val mail = admin.queryForMap("select id,encrypted_link from forena.auth_mail_outbox where recipient=? and kind='verify'", address)
        val verification = browserSettings.decrypt(mail["encrypted_link"].toString(), mail["id"].toString()).substringAfter("?code=")
        assertThat(request("/api/auth/email/verify", """{"code":"$verification"}""", cookie = browser, method = "POST").statusCode()).isEqualTo(200)
        val subject = admin.queryForObject("select subject from forena.native_user where email=?", UUID::class.java, address)!!
        val login = HttpClient.newHttpClient().send(HttpRequest.newBuilder(URI("http://127.0.0.1:${environment.getRequiredProperty("local.server.port")}/api/auth/login"))
            .header("Origin", browserSettings.origin).header("X-Forena-Request", "1").header("Cookie", browser)
            .header("Content-Type", "application/x-www-form-urlencoded")
            .POST(HttpRequest.BodyPublishers.ofString("email=$address&password=synthetic-new-password")).build(), HttpResponse.BodyHandlers.ofString())
        assertThat(login.statusCode()).isEqualTo(200)
        val authenticated = login.headers().allValues("set-cookie").single { it.startsWith(browserSettings.cookieName + "=") }.substringBefore(';')
        cookies[subject] = authenticated
        assertThat(request("/api/me/roster-invitation", cookie = authenticated).body()).contains(address, "Ny spelare")
        admin.update("update forena.auth_mail_outbox set delivered_at=now() where id=(select mail_id from forena.roster_login_invitation where person_id=?)", person)
        assertThat(request("/api/me/roster-invitation", "{}", cookie = authenticated, method = "POST").statusCode()).isEqualTo(200)
        assertThat(admin.queryForObject("select subject from forena.person_access where person_id=? and kind='self'", UUID::class.java, person)).isEqualTo(subject)
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

    @Test
    fun `logout during lock wait does not revoke an admitted write but blocks the next request`() {
        DriverManager.getConnection(database.jdbcUrl, database.username, database.password).use {
            connection ->
            connection.autoCommit = false
            connection
                .prepareStatement("select id from forena.activity where id=? for update")
                .use {
                    it.setObject(1, activity)
                    it.executeQuery().close()
                }
            val result = CompletableFuture.supplyAsync { respond("""{"response":"accepted"}""") }
            try {
                await().atMost(Duration.ofSeconds(10)).until {
                    admin.queryForObject(
                        "select count(*) from pg_stat_activity where usename='forena_api_runtime' and wait_event_type='Lock'",
                        Long::class.java,
                    )!! > 0
                }
                admin.update(
                    "insert into forena.revoked_session(id,subject) values(?,?)",
                    session,
                    parent,
                )
            } finally {
                connection.rollback()
            }
            assertThat(result.get(10, SECONDS).statusCode()).isEqualTo(200)
            assertThat(row()["revision"]).isEqualTo(1L)
            assertThat(history()).isEqualTo(1)
            assertThat(dirty()).isEqualTo(1)
            assertThat(respond("""{"response":"declined"}""").statusCode()).isEqualTo(401)
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
        admin.update("insert into forena.attendance_report(activity_id,organization_id,reported_by,reported_at) values(?,?,?,now())", activity, organization, parent)
        admin.update("insert into forena.attendance_record(activity_id,organization_id,person_id) values(?,?,?)", activity, organization, child1)
        admin.update("insert into forena.attendance_record(activity_id,organization_id,person_id,present) values(?,?,?,false)", activity, organization, child2)
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
        assertThat(request(attendancePath(), attendanceBody(present = listOf(child1))).statusCode()).isEqualTo(204)
        assertThat(request(attendancePath(), attendanceBody(1, listOf(UUID.randomUUID()))).statusCode()).isEqualTo(400)
        assertThat(request(attendancePath(), attendanceBody(1, emptyList(), confirm = true), cookie=loginCookie(outsider)).statusCode()).isEqualTo(403)
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

    @Test fun `attendance permission reads the complete assessed roster independently of invitation management`() {
        rosterMember(own, start = "current_date-2")
        rosterPermission(permission = "attendance.manage")
        admin.update("update forena.activity set starts_at=now()-interval '2 hours',ends_at=now()-interval '1 hour' where id=?", activity)
        admin.update("update forena.invitation set response='accepted',responded_at=now() where activity_id=? and person_id=?", activity, child1)
        admin.update("update forena.invitation set response='declined',responded_at=now() where activity_id=? and person_id=?", activity, other)
        val path = attendancePath()
        val roster = json.readTree(request(path).body()).get("roster").toList()
        assertThat(roster.map { it.get("personId").asString() }).containsExactlyInAnyOrder(own.toString(), child1.toString(), child2.toString(), other.toString())
        assertThat(roster.single { it.get("personId").asString() == child1.toString() }.get("response").asString()).isEqualTo("accepted")
        assertThat(roster.single { it.get("personId").asString() == other.toString() }.get("response").asString()).isEqualTo("declined")
        assertThat(request(path, attendanceBody(present = listOf(other))).statusCode()).isEqualTo(204)
        assertThat(request(path, attendanceBody(1, listOf(child1))).statusCode()).isEqualTo(204)
        assertThat(admin.queryForList("select person_id from forena.attendance_record where activity_id=? and present", UUID::class.java, activity))
            .containsExactly(child1)
        admin.update("update forena.team_permission_assignment set active=false where person_id=? and permission='attendance.manage'", own)
        assertThat(request(path).statusCode()).isEqualTo(403)
        assertThat(request(path, attendanceBody(2)).statusCode()).isEqualTo(403)
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
        assertThat(request("/api/v3/api-docs", cookie=null).statusCode()).isEqualTo(200)
        val result = request("/api/v3/api-docs")
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

    @Test
    fun `deadline exception uses admitted permission and rejects subsequent requests after revocation`() {
        val team =
            admin.queryForObject(
                "select team_id from forena.activity where id=?",
                UUID::class.java,
                activity,
            )!!
        admin.update(
            "insert into forena.team_permission_assignment(organization_id,team_id,person_id,permission,starts_on) values(?,?,?,'activity.manage',current_date)",
            organization,
            team,
            own,
        )
        admin.update(
            "update forena.activity set response_due_at=now()-interval '1 minute' where id=?",
            activity,
        )
        DriverManager.getConnection(database.jdbcUrl, database.username, database.password).use {
            connection ->
            connection.autoCommit = false
            connection
                .prepareStatement("select id from forena.activity where id=? for update")
                .use {
                    it.setObject(1, activity)
                    it.executeQuery().close()
                }
            val result = CompletableFuture.supplyAsync { respond("""{"response":"accepted"}""") }
            awaitRuntimeLocks(1)
            admin.update(
                "update forena.team_permission_assignment set active=false where person_id=?",
                own,
            )
            connection.commit()
            assertThat(result.get(5, SECONDS).statusCode()).isEqualTo(200)
        }
        assertThat(history()).isEqualTo(1)
        assertThat(dirty()).isEqualTo(1)
        assertThat(respond("""{"response":"declined"}""").statusCode()).isEqualTo(409)
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
            "FORENA_M09_FRONTEND" to (System.getenv("FORENA_M09_FRONTEND") ?: "http://localhost:3002"),
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
                "FORENA_M09_FRONTEND" to (System.getenv("FORENA_M09_FRONTEND") ?: "http://localhost:3002"),
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

    @Test
    fun `administration completes an admitted command and denies new commands after revocation`() {
        bootstrapAdministrator()
        val club = createAdminClub()
        val section =
            admin.queryForObject(
                "select id from forena.section where organization_id=?",
                UUID::class.java,
                club,
            )!!
        request(
            "/api/admin/sections/$section/administrators",
            """{"email":"$outsider@example.invalid"}""",
            method = "POST",
        )
        val outsiderCookie = loginCookie(outsider)
        DriverManager.getConnection(database.jdbcUrl, database.username, database.password).use {
            connection ->
            connection.autoCommit = false
            connection.createStatement().use {
                it.executeQuery("select * from forena.administration_state for update").close()
            }
            val result = CompletableFuture.supplyAsync {
                request(
                    "/api/admin/sections/$section/teams",
                    """{"name":"Godkänt före väntan"}""",
                    cookie = outsiderCookie,
                    method = "POST",
                )
            }
            try {
                await().atMost(Duration.ofSeconds(10)).until {
                    admin.queryForObject(
                        "select count(*) from pg_stat_activity where usename='forena_api_runtime' and wait_event_type='Lock'",
                        Long::class.java,
                    )!! > 0
                }
                admin.update(
                    "update forena.section_administrator set active=false where subject=?",
                    outsider,
                )
            } finally {
                connection.rollback()
            }
            assertThat(result.get(10, SECONDS).statusCode()).isEqualTo(200)
            assertThat(
                    admin.queryForObject(
                        "select count(*) from forena.team where section_id=?",
                        Long::class.java,
                        section,
                    )
                )
                .isEqualTo(1)
            assertThat(
                    request(
                            "/api/admin/sections/$section/teams",
                            """{"name":"Nytt anrop nekas"}""",
                            cookie = outsiderCookie,
                            method = "POST",
                        )
                        .statusCode()
                )
                .isEqualTo(403)
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
