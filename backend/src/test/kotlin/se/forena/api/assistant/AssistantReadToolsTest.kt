package se.forena.api.assistant

import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit.SECONDS
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.mockito.Mockito.mock
import org.mockito.Mockito.never
import org.mockito.Mockito.verify
import org.mockito.Mockito.verifyNoInteractions
import org.mockito.Mockito.`when`
import org.springframework.ai.chat.model.ToolContext
import org.springframework.ai.tool.ToolCallback
import org.springframework.ai.tool.method.MethodToolCallbackProvider
import org.springframework.security.access.AccessDeniedException
import org.springframework.security.authentication.BadCredentialsException
import se.forena.api.activities.ActivityDutyService
import se.forena.api.activities.AssistantActivityService
import se.forena.api.activities.AssistantInvitation
import se.forena.api.activities.AssistantMemberService
import se.forena.api.activities.AssistantMembers
import se.forena.api.activities.AssistantTeamData
import se.forena.api.activities.AttendanceHistory
import se.forena.api.activities.AttendancePerson
import se.forena.api.activities.AttendanceService
import se.forena.api.activities.AttendanceSnapshot
import se.forena.api.activities.PersonalActivity
import se.forena.api.activities.PersonalOrganization
import se.forena.api.activities.PersonalTeam
import se.forena.api.extensions.CapabilityRuntime
import se.forena.api.identity.Actor
import tools.jackson.databind.json.JsonMapper

class AssistantReadToolsTest {
    private val activities = mock(AssistantActivityService::class.java)
    private val resources = AssistantToolAccessService(activities)
    private val attendance = mock(AttendanceService::class.java)
    private val members = mock(AssistantMemberService::class.java)
    private val documents = mock(AssistantDocumentService::class.java)
    private val duties = mock(ActivityDutyService::class.java)
    private val signals = mock(CapabilityRuntime::class.java)
    private val tools = AssistantReadTools(activities, resources, attendance, members, documents, duties, signals)
    private val actor = Actor(UUID.randomUUID(), UUID.randomUUID(), "synthetic-private-tool-credential")
    private val organizationId = UUID.randomUUID()
    private val teamId = UUID.randomUUID()
    private val sectionId = UUID.randomUUID()
    private val activityId = UUID.randomUUID()
    private val context = AssistantToolScope.context(actor, organizationId, teamId)
    private val now = Instant.parse("2026-11-10T17:00:00Z")
    private val from = LocalDate.parse("2026-11-01")
    private val through = LocalDate.parse("2026-11-10")
    private val json = JsonMapper.builder().build()

    @Test
    fun `missing or wrongly typed identity stops every tool before reading domain data`() {
        val invalidContexts = listOf(
            ToolContext(emptyMap()),
            ToolContext(mapOf("actor" to actor)),
            ToolContext(mapOf("forena.tool.scope" to actor.subject.toString())),
        )

        invalidContexts.forEach { invalid ->
            val calls = listOf<() -> Any?>(
                { tools.teamContext(teamId, invalid) },
                { tools.activity(activityId, invalid) },
                { tools.invitations(activityId, invalid) },
                { tools.attendance(activityId, invalid) },
                { tools.history(teamId, from, through, invalid) },
                { tools.documents(organizationId, null, invalid) },
                { tools.members(organizationId, null, invalid) },
                { tools.dutyTargets(teamId, invalid) },
                { tools.capabilitySignals(teamId, invalid) },
            )
            calls.forEach { call ->
                assertThatThrownBy { call() }.isInstanceOf(BadCredentialsException::class.java)
            }
        }

        verifyNoInteractions(activities, attendance, members, documents, duties, signals)
    }

    @Test
    fun `globally accessible activity in another club or team cannot escape the routed scope`() {
        val otherClubActivity = activity(organization = UUID.randomUUID())
        val otherTeamActivity = activity(team = UUID.randomUUID())

        listOf(otherClubActivity, otherTeamActivity).forEach { globallyAccessible ->
            `when`(activities.activity(actor, activityId)).thenReturn(globallyAccessible)

            assertThatThrownBy { tools.activity(activityId, context) }
                .isInstanceOf(AccessDeniedException::class.java)
            assertThatThrownBy { tools.invitations(activityId, context) }
                .isInstanceOf(AccessDeniedException::class.java)
            assertThatThrownBy { tools.attendance(activityId, context) }
                .isInstanceOf(AccessDeniedException::class.java)
        }

        verify(activities, never()).invitations(actor, activityId)
        verifyNoInteractions(attendance, members, documents, duties, signals)
    }

    @Test
    fun `explicit foreign team is rejected before reading history documents members duties or signals`() {
        val otherTeam = UUID.randomUUID()

        val calls = listOf<() -> Any?>(
            { tools.teamContext(otherTeam, context) },
            { tools.history(otherTeam, from, through, context) },
            { tools.documents(organizationId, otherTeam, context) },
            { tools.members(organizationId, otherTeam, context) },
            { tools.dutyTargets(otherTeam, context) },
            { tools.capabilitySignals(otherTeam, context) },
        )
        calls.forEach { call ->
            assertThatThrownBy { call() }.isInstanceOf(AccessDeniedException::class.java)
        }

        verifyNoInteractions(activities, attendance, members, documents, duties, signals)
    }

    @Test
    fun `foreign organization argument is rejected before documents or members are read`() {
        val otherOrganization = UUID.randomUUID()

        assertThatThrownBy { tools.documents(otherOrganization, null, context) }
            .isInstanceOf(AccessDeniedException::class.java)
        assertThatThrownBy { tools.members(otherOrganization, null, context) }
            .isInstanceOf(AccessDeniedException::class.java)

        verifyNoInteractions(activities, attendance, members, documents, duties, signals)
    }

    @Test
    fun `accessible team from another organization does not authorize a club scoped document or member read`() {
        val clubScope = AssistantToolScope.context(actor, organizationId)
        `when`(activities.team(actor, teamId)).thenReturn(team().copy(organizationId = UUID.randomUUID()))

        assertThatThrownBy { tools.documents(organizationId, teamId, clubScope) }
            .isInstanceOf(AccessDeniedException::class.java)
        assertThatThrownBy { tools.members(organizationId, teamId, clubScope) }
            .isInstanceOf(AccessDeniedException::class.java)

        verifyNoInteractions(documents, members)
    }

    @Test
    fun `omitting the team cannot broaden a routed team read to the whole club`() {
        val documentResult = AssistantDocuments(emptyList(), truncated = true)
        val memberResult = AssistantMembers(250, emptyList(), truncated = true)
        `when`(activities.team(actor, teamId)).thenReturn(team())
        `when`(documents.read(actor, organizationId, teamId, sectionId)).thenReturn(documentResult)
        `when`(members.read(actor, organizationId, teamId, sectionId)).thenReturn(memberResult)

        assertThat(tools.documents(organizationId, null, context)).isEqualTo(documentResult)
        assertThat(tools.members(organizationId, null, context)).isEqualTo(memberResult)

        verify(documents).read(actor, organizationId, teamId, sectionId)
        verify(members).read(actor, organizationId, teamId, sectionId)
    }

    @Test
    fun `Spring callback retains the verified actor and routing scope on another thread`() {
        `when`(activities.team(actor, teamId)).thenReturn(team())
        `when`(documents.read(actor, organizationId, teamId, sectionId))
            .thenReturn(AssistantDocuments(listOf(AssistantDocument(UUID.randomUUID(), "Lagets rutin", "Samling 15 minuter före.", "leader")), false))
        val callback = callback("get_assistant_documents")
        val arguments = json.writeValueAsString(mapOf("organizationId" to organizationId, "teamId" to null))

        val result = Executors.newSingleThreadExecutor().use { executor ->
            executor.submit<String> { callback.call(arguments, context) }.get(5, SECONDS)
        }

        assertThat(json.readTree(result).path("documents").single().path("title").asString())
            .isEqualTo("Lagets rutin")
        assertThat(result).doesNotContain(actor.bearerToken, actor.subject.toString(), actor.session.toString())
        verify(documents).read(actor, organizationId, teamId, sectionId)
    }

    @ParameterizedTest
    @ValueSource(ints = [0, 200, 201])
    fun `invitation summary counts all authorized responses even when detail rows are truncated`(count: Int) {
        val invitations = List(count) { index ->
            AssistantInvitation(
                UUID.randomUUID(), UUID.randomUUID(), "Deltagare $index",
                if (index == 200) "pending" else if (index % 2 == 0) "accepted" else "declined",
                null, 1,
            )
        }
        `when`(activities.activity(actor, activityId)).thenReturn(activity())
        `when`(activities.team(actor, teamId)).thenReturn(team(invitationAccess = true))
        `when`(activities.invitations(actor, activityId)).thenReturn(invitations)

        val result = tools.invitations(activityId, context)

        assertThat(result.invitations).hasSize(minOf(count, 200))
        assertThat(result.invitationSummary.values.sum()).isEqualTo(count)
        assertThat(result.invitationSummaryScope).isEqualTo("whole_activity")
        assertThat(result.truncated).isEqualTo(count > 200)
        if (count == 201) {
            assertThat(result.invitationSummary).containsEntry("accepted", 100)
                .containsEntry("declined", 100).containsEntry("pending", 1)
        }
    }

    @Test
    fun `own invitation responses are identified as a partial activity view`() {
        `when`(activities.activity(actor, activityId)).thenReturn(activity())
        `when`(activities.team(actor, teamId)).thenReturn(team(invitationAccess = false))
        `when`(activities.invitations(actor, activityId)).thenReturn(
            listOf(AssistantInvitation(UUID.randomUUID(), UUID.randomUUID(), "Egen deltagare", "accepted", null, 1))
        )

        val result = tools.invitations(activityId, context)

        assertThat(result.invitationSummaryScope).isEqualTo("visible_people_only")
        assertThat(result.invitationSummary).containsOnlyKeys("accepted").containsEntry("accepted", 1)
    }

    @Test
    fun `activity read access delegates attendance authorization to the current domain decision`() {
        val denied = AccessDeniedException("Attendance denied by the domain")
        `when`(activities.activity(actor, activityId)).thenReturn(activity(canManageAttendance = false))
        `when`(attendance.snapshot(actor, activityId)).thenThrow(denied)

        assertThatThrownBy { tools.attendance(activityId, context) }
            .isSameAs(denied)

        verify(attendance).snapshot(actor, activityId)
    }

    @ParameterizedTest
    @ValueSource(booleans = [false, true])
    fun `attendance tool preserves authorized unknown attendance independently of the activity hint`(activityHint: Boolean) {
        val roster = listOf(AttendancePerson(UUID.randomUUID(), "Synlig deltagare", "player", "accepted", null))
        val snapshot = AttendanceSnapshot(
            revision = 7,
            reportedAt = now,
            status = "reported",
            writable = true,
            roster = roster,
            candidates = listOf(AttendancePerson(UUID.randomUUID(), "Privat kandidat", "player", null, null)),
            groups = emptyList(),
            history = listOf(AttendanceHistory(6, "Privat rapportör", now.minusSeconds(60), emptyList())),
        )
        `when`(activities.activity(actor, activityId)).thenReturn(activity(canManageAttendance = activityHint))
        `when`(attendance.snapshot(actor, activityId)).thenReturn(snapshot)

        val result = callback("get_activity_attendance").call(
            json.writeValueAsString(mapOf("activityId" to activityId)), context
        )

        val payload = json.readTree(result)
        assertThat(payload.properties().map { it.key }).containsExactlyInAnyOrder("revision", "status", "writable", "roster")
        assertThat(payload.path("revision").asInt()).isEqualTo(7)
        assertThat(payload.path("roster").single().path("present").isNull).isTrue()
        assertThat(result).doesNotContain("Privat kandidat", "Privat rapportör", "history", "candidates", actor.bearerToken)
        verify(attendance).snapshot(actor, activityId)
    }

    @Test
    fun `model argument schemas expose no identity credentials or routing context`() {
        val callbacks = MethodToolCallbackProvider.builder().toolObjects(tools).build().toolCallbacks

        callbacks.forEach { callback ->
            val properties = json.readTree(callback.toolDefinition.inputSchema()).path("properties")
                .properties().map { it.key }
            assertThat(properties).doesNotContain("actor", "context", "scope", "subject", "session", "bearerToken")
        }
    }

    private fun callback(name: String): ToolCallback =
        MethodToolCallbackProvider.builder().toolObjects(tools).build().toolCallbacks
            .single { it.toolDefinition.name() == name }

    private fun team(invitationAccess: Boolean = true) = AssistantTeamData(
        teamId, organizationId, "Testlaget", "Testföreningen", sectionId, null, "Europe/Stockholm",
        null, invitationAccess, true, emptyList(),
    )

    private fun activity(
        organization: UUID = organizationId,
        team: UUID = teamId,
        canManageAttendance: Boolean = true,
    ) = PersonalActivity(
        id = activityId,
        title = "Träning",
        starts_at = now,
        ends_at = now.plusSeconds(3600),
        gathering_at = null,
        response_due_at = null,
        location = "Testplanen",
        description = "",
        status = "scheduled",
        organization = PersonalOrganization(organization, "Testföreningen", "Europe/Stockholm", null),
        team = PersonalTeam(team, organization, "Testlaget", emptyList()),
        people = emptyList(),
        can_manage_activities = false,
        can_manage_attendance = canManageAttendance,
    )
}
