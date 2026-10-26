package se.forena.api

import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.file.Files
import java.nio.file.Path
import java.time.Duration
import java.util.Base64
import java.util.UUID
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit.SECONDS
import org.assertj.core.api.Assertions.assertThat
import org.awaitility.Awaitility.await
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers.any
import org.mockito.ArgumentMatchers.anyString
import org.mockito.Mockito.doThrow
import org.mockito.Mockito.reset
import org.mockito.Mockito.times
import org.mockito.Mockito.verify
import org.mockito.Mockito.verifyNoInteractions
import org.mockito.Mockito.`when`
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.core.env.Environment
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.springframework.modulith.events.core.EventPublicationRepository
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean
import org.testcontainers.postgresql.PostgreSQLContainer
import se.forena.api.activities.ScheduledInvitationService
import se.forena.api.activities.internal.ScheduledInvitationRepository
import se.forena.api.email.EmailDeliveryResult
import se.forena.api.email.EmailMessage
import se.forena.api.email.EmailSender
import se.forena.api.notifications.NotificationWorker
import se.forena.api.notifications.internal.InvitationEmailDelivery
import se.forena.api.notifications.internal.InvitationEmailRepository
import se.forena.api.notifications.internal.PublicationRecovery

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class NotificationTest {
    companion object {
        private const val WORKER_TOKEN = "synthetic-notification-worker-token-0001"
        val database =
            PostgreSQLContainer("postgres:17.6-alpine").withInitScript("init.sql").also {
                it.start()
            }

        @JvmStatic
        @DynamicPropertySource
        fun properties(registry: DynamicPropertyRegistry) {
            registry.add("spring.datasource.url") { database.jdbcUrl }
            registry.add("spring.datasource.username") { "forena_api_runtime" }
            registry.add("spring.datasource.password") { "local-runtime-only" }
            registry.add("spring.liquibase.user") { "forena_api_owner" }
            registry.add("spring.liquibase.password") { "local-owner-only" }
            registry.add("forena.email.resend-api-key") { "synthetic-unused-key" }
            registry.add("forena.email.from") { "test@example.invalid" }
            registry.add("forena.web-session.origin") { "https://app.example.invalid" }
            registry.add("forena.web-session.key") {
                Base64.getEncoder().encodeToString(ByteArray(32) { 7 })
            }
            registry.add("forena.notifications.enabled") { true }
            registry.add("forena.notifications.worker-token") { WORKER_TOKEN }
            registry.add("forena.notifications.test-recipients") {
                "self@example.invalid,guardian@example.invalid"
            }
        }
    }

    @Autowired lateinit var jdbc: JdbcTemplate
    @Autowired lateinit var environment: Environment
    @Autowired lateinit var schedules: ScheduledInvitationService
    @Autowired lateinit var delivery: InvitationEmailDelivery
    @Autowired lateinit var recovery: PublicationRecovery
    @Autowired lateinit var worker: NotificationWorker
    @Autowired lateinit var publicationRecords: EventPublicationRepository
    @MockitoBean lateinit var sender: EmailSender
    @MockitoSpyBean lateinit var scheduleRecords: ScheduledInvitationRepository
    @MockitoSpyBean lateinit var emailRecords: InvitationEmailRepository
    private val admin by lazy {
        JdbcTemplate(
            DriverManagerDataSource(database.jdbcUrl, database.username, database.password)
        )
    }
    private lateinit var organization: UUID
    private lateinit var team: UUID
    private lateinit var activity: UUID
    private lateinit var person: UUID
    private lateinit var schedule: UUID
    private lateinit var self: UUID
    private lateinit var guardian: UUID

    @BeforeEach
    fun seed() {
        reset(sender, scheduleRecords, emailRecords)
        admin.execute(
            "truncate forena.invitation_email, forena.invitation_notification, forena.event_publication, forena.activity_schedule"
        )
        organization = UUID.randomUUID()
        team = UUID.randomUUID()
        activity = UUID.randomUUID()
        person = UUID.randomUUID()
        schedule = UUID.randomUUID()
        self = UUID.randomUUID()
        guardian = UUID.randomUUID()
        admin.update("insert into forena.organization(id,name) values(?,'Testklubb')", organization)
        admin.update(
            "insert into forena.team(id,organization_id,name) values(?,?,'Testlag')",
            team,
            organization,
        )
        admin.update(
            "insert into forena.person(id,organization_id,display_name) values(?,?,'Testperson')",
            person,
            organization,
        )
        for ((subject, email, kind) in
            listOf(
                Triple(self, "self@example.invalid", "self"),
                Triple(guardian, "guardian@example.invalid", "guardian"),
            )) {
            admin.update("insert into forena.account(subject) values(?)", subject)
            admin.update(
                "insert into forena.native_user(subject,email,password_hash,verified) values(?,?,?,true)",
                subject,
                "$subject-$email",
                "unused",
            )
            admin.update(
                "insert into forena.person_access(person_id,organization_id,subject,kind) values(?,?,?,?)",
                person,
                organization,
                subject,
                kind,
            )
        }
        // Addresses are unique globally; only this fixture's accounts are active recipients.
        admin.update(
            "update forena.native_user set email = subject::text || '-old@example.invalid' where email in ('self@example.invalid','guardian@example.invalid')"
        )
        admin.update(
            "update forena.native_user set email='self@example.invalid' where subject=?",
            self,
        )
        admin.update(
            "update forena.native_user set email='guardian@example.invalid' where subject=?",
            guardian,
        )
        admin.update(
            "insert into forena.team_membership(id,organization_id,team_id,person_id,role,starts_on) values(?,?,?,?,'participant',current_date-1)",
            UUID.randomUUID(),
            organization,
            team,
            person,
        )
        admin.update(
            "insert into forena.activity(id,organization_id,team_id,title,starts_at,ends_at,location) values(?,?,?,'Träning',now()+interval '1 day',now()+interval '25 hours','Plan 1')",
            activity,
            organization,
            team,
        )
        addSchedule(schedule, "invitation")
        `when`(sender.send(anyMessage()))
            .thenReturn(EmailDeliveryResult.Accepted("provider-test-id"))
    }

    private fun addSchedule(id: UUID, kind: String) {
        admin.update(
            "insert into forena.activity_schedule(id,activity_id,organization_id,kind,due_at,audience_roles) values(?,?,?,?,now()-interval '1 minute','participant')",
            id,
            activity,
            organization,
            kind,
        )
    }

    private fun emptyMessage() = EmailMessage("", "", "", "")

    private fun anyMessage(): EmailMessage = any(EmailMessage::class.java) ?: emptyMessage()

    private fun deadline(): Long = System.nanoTime() + Duration.ofSeconds(30).toNanos()

    private fun count(table: String): Int =
        jdbc.queryForObject("select count(*) from forena.$table", Int::class.java) ?: 0

    private fun state(id: UUID = schedule): String? =
        jdbc.queryForObject(
            "select state from forena.activity_schedule where id=?",
            String::class.java,
            id,
        )

    private fun dueAgain() =
        admin.update(
            "update forena.invitation_email set next_attempt=now()-interval '1 second' where state='pending'"
        )

    @Test
    fun `schedule materialization registry handover and email acceptance survive replay`() {
        assertThat(schedules.materialize(deadline())).isEqualTo(1)
        assertThat(state()).isEqualTo("completed")
        assertThat(count("invitation_notification")).isEqualTo(2)
        assertThat(count("invitation_email")).isEqualTo(2)
        assertThat(
                jdbc.queryForObject(
                    "select count(*) from forena.event_publication where completion_date is not null",
                    Int::class.java,
                )
            )
            .isEqualTo(2)
        assertThat(worker.run().processedEmails).isEqualTo(2)
        val messages = org.mockito.ArgumentCaptor.forClass(EmailMessage::class.java)
        verify(sender, times(2)).send(messages.capture() ?: emptyMessage())
        assertThat(messages.allValues.map { it.to })
            .containsExactlyInAnyOrder("self@example.invalid", "guardian@example.invalid")
        assertThat(messages.allValues.first().text)
            .contains("Testperson", "Testklubb", "Testlag", "Plan 1", "/activities/$activity")
        assertThat(
                jdbc.queryForObject(
                    "select count(*) from forena.invitation_email where state='accepted' and provider_message_id='provider-test-id'",
                    Int::class.java,
                )
            )
            .isEqualTo(2)
        // An incomplete registry acknowledgement can replay a handover after transport acceptance.
        admin.update(
            "update forena.event_publication set status='PROCESSING',completion_date=null,publication_date=now()-interval '10 minutes'"
        )
        recovery.recover(deadline())
        assertThat(worker.run().processedEmails).isZero()
        verify(sender, times(2)).send(anyMessage())
        assertThat(count("invitation_email")).isEqualTo(2)
    }

    @Test
    fun `late failure rolls back invitation checkpoints and registry then retries durably`() {
        doThrow(IllegalStateException("synthetic late failure"))
            .`when`(scheduleRecords)
            .finish(
                any(UUID::class.java) ?: UUID(0, 0),
                anyString(),
                any(java.time.Instant::class.java) ?: java.time.Instant.EPOCH,
            )
        schedules.materialize(deadline())
        assertThat(state()).isEqualTo("pending")
        assertThat(count("invitation_notification")).isZero()
        assertThat(count("event_publication")).isZero()
        assertThat(
                jdbc.queryForObject(
                    "select count(*) from forena.invitation where activity_id=?",
                    Int::class.java,
                    activity,
                )
            )
            .isZero()
        assertThat(
                jdbc.queryForObject(
                    "select attempts from forena.activity_schedule where id=?",
                    Int::class.java,
                    schedule,
                )
            )
            .isEqualTo(1)
        reset(scheduleRecords)
        admin.update("update forena.activity_schedule set next_attempt=now() where id=?", schedule)
        assertThat(schedules.materialize(deadline())).isEqualTo(1)
        assertThat(count("invitation_email")).isEqualTo(2)
    }

    @Test
    fun `cancelled past and answered reminder schedules cannot create messages`() {
        admin.update("update forena.activity set status='cancelled' where id=?", activity)
        schedules.materialize(deadline())
        assertThat(state()).isEqualTo("cancelled")
        assertThat(count("invitation_email")).isZero()
        admin.update("update forena.activity set status='scheduled' where id=?", activity)
        admin.update(
            "insert into forena.invitation(id,organization_id,activity_id,person_id,response,responded_at) values(?,?,?,?,'accepted',now())",
            UUID.randomUUID(),
            organization,
            activity,
            person,
        )
        val reminder = UUID.randomUUID()
        addSchedule(reminder, "reminder")
        schedules.materialize(deadline())
        assertThat(state(reminder)).isEqualTo("completed")
        assertThat(count("invitation_email")).isZero()
        verifyNoInteractions(sender)
    }

    @Test
    fun `current membership and explicit access verified account boundaries determine recipients`() {
        admin.update("update forena.person_access set active=false where subject=?", guardian)
        admin.update("update forena.native_user set verified=false where subject=?", self)
        schedules.materialize(deadline())
        assertThat(count("invitation_email")).isZero()
        val next = UUID.randomUUID()
        addSchedule(next, "reminder")
        admin.update("update forena.native_user set verified=true where subject=?", self)
        admin.update("update forena.team_membership set active=false where person_id=?", person)
        schedules.materialize(deadline())
        assertThat(count("invitation_email")).isZero()
    }

    @Test
    fun `timeout after provider acceptance reuses the immutable key`() {
        schedules.materialize(deadline())
        val seen = mutableListOf<EmailMessage>()
        `when`(sender.send(anyMessage())).thenAnswer {
            seen.add(it.getArgument(0))
            if (seen.size == 1) EmailDeliveryResult.Retry()
            else EmailDeliveryResult.Accepted("same-provider-id")
        }
        delivery.deliverOne()
        // Isolate the retried recipient from the second pending delivery.
        admin.update(
            "update forena.invitation_email set next_attempt=now()+interval '1 hour' where attempts=0"
        )
        dueAgain()
        admin.update(
            "update forena.invitation_email set next_attempt=now()+interval '1 hour' where attempts=0"
        )
        delivery.deliverOne()
        assertThat(seen).hasSize(2)
        assertThat(seen[1]).isEqualTo(seen[0])
        assertThat(
                jdbc.queryForObject(
                    "select count(*) from forena.invitation_email where state='accepted' and attempts=2",
                    Int::class.java,
                )
            )
            .isEqualTo(1)
    }

    @Test
    fun `expired idempotency window and nonallowlisted addresses never send automatically`() {
        schedules.materialize(deadline())
        admin.update(
            "update forena.invitation_email set first_attempt_at=now()-interval '24 hours',attempts=1 where recipient='self@example.invalid'"
        )
        admin.update(
            "update forena.invitation_email set recipient='not-allowed@example.invalid' where recipient='guardian@example.invalid'"
        )
        worker.run()
        assertThat(
                jdbc.queryForList("select state from forena.invitation_email", String::class.java)
            )
            .containsExactlyInAnyOrder("uncertain", "suppressed")
        verifyNoInteractions(sender)
    }

    @Test
    fun `permanent rejection stops retries while rate limits persist backoff`() {
        schedules.materialize(deadline())
        `when`(sender.send(anyMessage()))
            .thenReturn(EmailDeliveryResult.Rejected, EmailDeliveryResult.Retry(600))
        worker.run()
        assertThat(
                jdbc.queryForObject(
                    "select count(*) from forena.invitation_email where state='failed'",
                    Int::class.java,
                )
            )
            .isEqualTo(1)
        assertThat(
                jdbc.queryForObject(
                    "select count(*) from forena.invitation_email where state='pending' and next_attempt > now()+interval '9 minutes'",
                    Int::class.java,
                )
            )
            .isEqualTo(1)
    }

    @Test
    fun `concurrent workers materialize once and lease prevents a second HTTP attempt`() {
        val materializers =
            List(2) { CompletableFuture.supplyAsync { schedules.materialize(deadline()) } }
        materializers.forEach { it.get(10, SECONDS) }
        assertThat(count("invitation_notification")).isEqualTo(2)
        admin.update(
            "update forena.invitation_email set state='suppressed' where recipient='guardian@example.invalid'"
        )
        val entered = CountDownLatch(1)
        val release = CountDownLatch(1)
        `when`(sender.send(anyMessage())).thenAnswer {
            entered.countDown()
            check(release.await(10, SECONDS))
            EmailDeliveryResult.Accepted("single-effect")
        }
        val first = CompletableFuture.supplyAsync { delivery.deliverOne() }
        try {
            assertThat(entered.await(10, SECONDS)).isTrue()
            assertThat(delivery.deliverOne()).isFalse()
        } finally {
            release.countDown()
        }
        assertThat(first.get(10, SECONDS)).isTrue()
        verify(sender, times(1)).send(anyMessage())
    }

    @Test
    fun `real JVM crashes and SIGTERM recover without a second provider effect`() {
        schedules.materialize(deadline())
        admin.update(
            "update forena.invitation_email set state='suppressed' where recipient='guardian@example.invalid'"
        )
        admin.execute(
            "create table if not exists forena.notification_test_provider(id text primary key, jvm_id text not null, requests integer not null default 1)"
        )
        admin.execute(
            "grant select,insert,update on forena.notification_test_provider to forena_api_runtime"
        )
        admin.execute("truncate forena.notification_test_provider")
        fun run(mode: String): Int {
            val log = Files.createTempFile("notification-process-", ".log")
            val process =
                ProcessBuilder(
                        Path.of(System.getProperty("java.home"), "bin", "java").toString(),
                        "-cp",
                        System.getProperty(
                            "surefire.test.class.path",
                            System.getProperty("java.class.path"),
                        ),
                        NotificationCrashProcess::class.java.name,
                        "--server.port=0",
                        "--spring.datasource.url=${database.jdbcUrl}",
                        "--spring.datasource.username=forena_api_runtime",
                        "--spring.datasource.password=local-runtime-only",
                        "--spring.liquibase.enabled=false",
                        "--forena.web-session.origin=https://app.example.invalid",
                        "--forena.web-session.key=${Base64.getEncoder().encodeToString(ByteArray(32) { 7 })}",
                        "--forena.email.resend-api-key=synthetic-unused-key",
                        "--forena.email.from=test@example.invalid",
                        "--forena.notifications.enabled=true",
                        "--forena.notifications.worker-token=$WORKER_TOKEN",
                        "--forena.notifications.test-recipients=self@example.invalid",
                        "--test.crash-mode=$mode",
                    )
                    .redirectErrorStream(true)
                    .redirectOutput(log.toFile())
                    .start()
            try {
                if (mode == "sigterm") {
                    await().atMost(Duration.ofSeconds(40)).untilAsserted {
                        assertThat(
                                admin.queryForObject(
                                    "select coalesce(max(requests),0) from forena.notification_test_provider",
                                    Int::class.java,
                                )
                            )
                            .isEqualTo(2)
                    }
                    process.destroy()
                }
                check(process.waitFor(45, SECONDS)) { "Child JVM timed out; see $log" }
                assertThat(process.exitValue()).describedAs(Files.readString(log)).isIn(0, 137, 143)
                return process.exitValue()
            } finally {
                if (process.isAlive) process.destroyForcibly().waitFor(10, SECONDS)
            }
        }
        assertThat(run("before-effect")).isEqualTo(137)
        assertThat(count("notification_test_provider")).isZero()
        assertThat(
                jdbc.queryForObject(
                    "select attempts from forena.invitation_email where state='pending'",
                    Int::class.java,
                )
            )
            .isEqualTo(1)
        dueAgain()
        assertThat(run("after-effect")).isEqualTo(137)
        assertThat(count("notification_test_provider")).isEqualTo(1)
        assertThat(
                jdbc.queryForObject(
                    "select attempts from forena.invitation_email where state='pending'",
                    Int::class.java,
                )
            )
            .isEqualTo(2)
        dueAgain()
        assertThat(run("sigterm")).isEqualTo(143)
        dueAgain()
        assertThat(run("normal")).isZero()
        assertThat(count("notification_test_provider")).isEqualTo(1)
        assertThat(
                jdbc.queryForObject(
                    "select attempts from forena.invitation_email where state='accepted'",
                    Int::class.java,
                )
            )
            .isEqualTo(4)
        verifyNoInteractions(sender)
    }

    @Test
    fun `registry recovery materializes a bounded page with a large backlog`() {
        admin.update(
            """
            insert into forena.event_publication(id,listener_id,event_type,serialized_event,publication_date,status,completion_attempts)
            select gen_random_uuid(),'invitation-email-v1','se.forena.api.activities.InvitationNotificationRequested',
                   jsonb_build_object('id',gen_random_uuid(),'version',1)::text,
                   now()-interval '10 minutes','PUBLISHED',0
            from generate_series(1,10000)
            """
        )
        val page =
            publicationRecords.findIncompletePublicationsPublishedBefore(java.time.Instant.now())
        assertThat(page).hasSize(20)
        assertThat(page.map { it.event }).allMatch {
            it is se.forena.api.activities.InvitationNotificationRequested
        }
        assertThat(count("invitation_email")).isZero()
        verifyNoInteractions(sender)
    }

    @Test
    fun `worker accepts only its dedicated bearer and never a browser or query token`() {
        val base =
            "http://127.0.0.1:${environment.getRequiredProperty("local.server.port")}/internal/notifications/run"
        val client = HttpClient.newHttpClient()
        fun call(url: String = base, token: String? = null): HttpResponse<String> {
            val request = HttpRequest.newBuilder(URI(url)).POST(HttpRequest.BodyPublishers.noBody())
            if (token != null) request.header("Authorization", "Bearer $token")
            return client.send(request.build(), HttpResponse.BodyHandlers.ofString())
        }
        assertThat(call().statusCode()).isEqualTo(401)
        assertThat(call(token = "wrong").statusCode()).isEqualTo(401)
        assertThat(call("$base?token=$WORKER_TOKEN").statusCode()).isEqualTo(401)
        verifyNoInteractions(sender)
        val accepted = call(token = WORKER_TOKEN)
        assertThat(accepted.statusCode()).isEqualTo(200)
        assertThat(accepted.headers().firstValue("Cache-Control").orElse("")).contains("no-store")
        assertThat(accepted.body()).doesNotContain("@", WORKER_TOKEN)
        val status =
            client.send(
                HttpRequest.newBuilder(URI(base.removeSuffix("run") + "status"))
                    .header("Authorization", "Bearer $WORKER_TOKEN")
                    .GET()
                    .build(),
                HttpResponse.BodyHandlers.ofString(),
            )
        assertThat(status.statusCode()).isEqualTo(200)
        assertThat(status.body())
            .contains(
                "\"pendingEmails\":0",
                "\"incompletePublications\":0",
                "\"startedAt\"",
                "\"completedAt\"",
            )
        assertThat(status.body()).doesNotContain("@", WORKER_TOKEN)
    }
}
