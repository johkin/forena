package se.forena.api.mcp

import io.modelcontextprotocol.common.McpTransportContext
import io.modelcontextprotocol.spec.McpSchema
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
import org.mockito.Mockito.verifyNoMoreInteractions
import org.mockito.Mockito.`when`
import org.springframework.ai.chat.model.ToolContext
import org.springframework.ai.mcp.McpToolUtils
import org.springframework.security.access.AccessDeniedException
import org.springframework.security.authentication.BadCredentialsException
import se.forena.api.activities.AccessibleInvitation
import se.forena.api.activities.ActivityDutyService
import se.forena.api.activities.AssistantActivityService
import se.forena.api.activities.AssistantHistory
import se.forena.api.activities.AssistantInvitation
import se.forena.api.activities.AssistantMemberService
import se.forena.api.activities.AssistantRosterPerson
import se.forena.api.activities.AssistantTeamData
import se.forena.api.activities.AttendanceService
import se.forena.api.activities.ActivityPerson
import se.forena.api.activities.InvitationResponse
import se.forena.api.activities.PersonalActivity
import se.forena.api.activities.PersonalOrganization
import se.forena.api.activities.PersonalOverview
import se.forena.api.activities.PersonalOverviewService
import se.forena.api.activities.PersonalTeam
import se.forena.api.activities.TeamAccessService
import se.forena.api.assistant.AssistantDocument
import se.forena.api.assistant.AssistantDocuments
import se.forena.api.assistant.AssistantDocumentService
import se.forena.api.assistant.AssistantReadTools
import se.forena.api.assistant.AssistantToolAccessService
import se.forena.api.assistant.AssistantToolCatalog
import se.forena.api.assistant.AssistantToolScope
import se.forena.api.assistant.SharedActivityTools
import se.forena.api.extensions.CapabilityRuntime
import se.forena.api.identity.AssistantTeam
import se.forena.api.identity.Actor
import tools.jackson.databind.json.JsonMapper

class McpActivityServiceTest {
    private val overview = mock(PersonalOverviewService::class.java)
    private val activityData = mock(AssistantActivityService::class.java)
    private val access = mock(TeamAccessService::class.java)
    private val resources = AssistantToolAccessService(activityData)
    private val service = SharedActivityTools(overview, activityData, access, resources)
    private val attendance = mock(AttendanceService::class.java)
    private val members = mock(AssistantMemberService::class.java)
    private val documents = mock(AssistantDocumentService::class.java)
    private val duties = mock(ActivityDutyService::class.java)
    private val signals = mock(CapabilityRuntime::class.java)
    private val assistantReads = AssistantReadTools(activityData, resources, attendance, members, documents, duties, signals)
    private val catalog = AssistantToolCatalog(service, assistantReads)
    private val actor = Actor(UUID.randomUUID(), UUID.randomUUID(), "synthetic-private-oauth-token")
    private val transport = McpTransportContext.create(mapOf(McpConfiguration.ACTOR_CONTEXT_KEY to actor))
    private val context = AssistantToolScope.context(actor)
    private val startsAt = Instant.parse("2026-11-10T17:00:00Z")
    private val organization = PersonalOrganization(UUID.randomUUID(), "Testföreningen", "Europe/Stockholm", null)
    private val team = PersonalTeam(UUID.randomUUID(), organization.id, "Testlaget", listOf("participant"))

    @Test
    fun `annotated tool keeps the verified actor across threads and exports only fifty minimized activities`() {
        val snapshot = snapshot(51)
        `when`(overview.overview(actor)).thenReturn(snapshot)
        val tool = tool("list_my_activities")
        val request = McpSchema.CallToolRequest.builder("list_my_activities").arguments(emptyMap()).build()

        val result = Executors.newSingleThreadExecutor().use { executor ->
            executor.submit<McpSchema.CallToolResult> { tool.callHandler().apply(transport, request) }.get(5, SECONDS)
        }

        assertThat(result.isError()).isFalse()
        val text = (result.content().single() as McpSchema.TextContent).text()
        val payload = JsonMapper.builder().build().readTree(text)
        assertThat(payload.path("limit").asInt()).isEqualTo(50)
        assertThat(payload.path("truncated").asBoolean()).isTrue()
        val activities = payload.path("activities")
        assertThat(activities.size()).isEqualTo(50)
        val activityIds = (0 until activities.size()).map { activities.get(it).path("id").asString() }
        assertThat(activityIds)
            .containsExactlyElementsOf(snapshot.activities.take(50).map { it.id.toString() })
        val first = activities.first()
        assertThat(first.properties().map { it.key }).containsExactlyInAnyOrder(
            "id", "title", "starts_at", "ends_at", "organization", "team", "location"
        )
        assertThat(first.path("title").asText()).isEqualTo("Träning 0")
        assertThat(first.path("starts_at").asText()).isEqualTo(startsAt.toString())
        assertThat(first.path("ends_at").asText()).isEqualTo(startsAt.plusSeconds(3600).toString())
        assertThat(first.path("organization").asText()).isEqualTo(organization.name)
        assertThat(first.path("team").asText()).isEqualTo(team.name)
        assertThat(first.path("location").asText()).isEqualTo("Testplanen")
        assertThat(text).doesNotContain(
            "Privat personnamn", "Privat svarskommentar", "Privat aktivitetsbeskrivning", actor.bearerToken
        )
        verify(overview).overview(actor)
    }

    @ParameterizedTest
    @ValueSource(ints = [0, 50])
    fun `complete results at or below the limit are not marked truncated`(count: Int) {
        `when`(overview.overview(actor)).thenReturn(snapshot(count))

        val result = service.listMyActivities(context)

        assertThat(result.activities).hasSize(count)
        assertThat(result.limit).isEqualTo(50)
        assertThat(result.truncated).isFalse()
    }

    @Test
    fun `missing or untrusted tool identity is rejected before reading activities`() {
        val invalidContexts = listOf(
            ToolContext(emptyMap()),
            ToolContext(mapOf(McpConfiguration.ACTOR_CONTEXT_KEY to actor)),
            ToolContext(mapOf(McpToolUtils.TOOL_CONTEXT_MCP_EXCHANGE_KEY to McpTransportContext.EMPTY)),
            ToolContext(mapOf(McpToolUtils.TOOL_CONTEXT_MCP_EXCHANGE_KEY to
                McpTransportContext.create(mapOf(McpConfiguration.ACTOR_CONTEXT_KEY to actor.subject.toString()))))
        )

        invalidContexts.forEach { invalid ->
            assertThatThrownBy { service.listMyActivities(invalid) }.isInstanceOf(BadCredentialsException::class.java)
        }

        verifyNoInteractions(overview)
    }

    @Test
    fun `tool failures do not export exception details`() {
        `when`(overview.overview(actor)).thenThrow(IllegalStateException("private database and connection details"))
        val tool = tool("list_my_activities")
        val request = McpSchema.CallToolRequest.builder("list_my_activities").arguments(emptyMap()).build()

        val result = tool.callHandler().apply(transport, request)

        assertThat(result.isError()).isTrue()
        val text = (result.content().single() as McpSchema.TextContent).text()
        assertThat(text).isEqualTo("Uppgifterna kunde inte hämtas.")
    }

    @Test
    fun `MCP discovers the same fourteen reads as the assistant without exposing identity arguments`() {
        val tools = McpConfiguration().readTools(catalog).map { it.tool() }
        assertThat(tools.map { it.name() }).containsExactlyInAnyOrder(
            "list_my_activities", "list_teams", "get_team_overview", "get_team_member_names", "get_accepted_participant_names",
            "get_team_context", "get_activity_details", "get_activity_invitations", "get_activity_attendance",
            "get_activity_history", "get_assistant_documents", "get_member_assignments", "get_duty_targets", "get_capability_signals",
        )
        assertThat(tools.map { it.name() }).containsExactlyInAnyOrderElementsOf(catalog.callbacks.map { it.toolDefinition.name() })
        tools.forEach { tool ->
            assertThat(tool.annotations().readOnlyHint()).isTrue()
            assertThat(tool.annotations().destructiveHint()).isFalse()
            assertThat(tool.inputSchema()["additionalProperties"]).isEqualTo(false)
            assertThat(tool.inputSchema().toString()).doesNotContain("actor", "context", "bearerToken", "session")
        }
    }

    @Test
    fun `MCP rejects extra missing and wrongly typed arguments before invoking domains`() {
        val invalid = listOf(
            "list_my_activities" to mapOf("subject" to actor.subject.toString()),
            "list_teams" to mapOf("offset" to "zero"),
            "list_teams" to mapOf("offset" to 0.5),
            "get_team_overview" to emptyMap<String, Any>(),
            "get_team_overview" to mapOf("teamId" to 42),
            "get_team_member_names" to mapOf("teamId" to team.id.toString(), "subject" to actor.subject.toString()),
            "get_accepted_participant_names" to mapOf("teamId" to team.id.toString()),
            "get_activity_invitations" to emptyMap<String, Any>(),
            "get_activity_invitations" to mapOf("activityId" to true),
            "get_assistant_documents" to mapOf("organizationId" to organization.id.toString(), "actor" to actor.subject.toString()),
            "get_assistant_documents" to mapOf("organizationId" to organization.id.toString(), "teamId" to 1),
            "get_activity_history" to mapOf("teamId" to team.id.toString(), "from" to "2026-11-01"),
        )
        invalid.forEach { (name, arguments) ->
            val request = McpSchema.CallToolRequest.builder(name).arguments(arguments).build()
            val result = tool(name).callHandler().apply(transport, request)
            assertThat(result.isError()).describedAs(name).isTrue()
            assertThat((result.content().single() as McpSchema.TextContent).text()).isEqualTo("Ogiltiga verktygsargument.")
        }
        verifyNoInteractions(overview, activityData, access, attendance, members, documents, duties, signals)
    }

    @Test
    fun `MCP converts transport identity for tools with arguments and rejects an absent actor`() {
        `when`(overview.overview(actor)).thenReturn(snapshot(0))
        `when`(activityData.catalogTeams(actor)).thenReturn(emptyList())
        val request = McpSchema.CallToolRequest.builder("list_teams").arguments(mapOf("offset" to 0)).build()
        val tool = tool("list_teams")

        val valid = tool.callHandler().apply(transport, request)
        val invalid = tool.callHandler().apply(McpTransportContext.EMPTY, request)

        assertThat(valid.isError()).isFalse()
        assertThat(invalid.isError()).isTrue()
        assertThat((invalid.content().single() as McpSchema.TextContent).text()).isEqualTo("Uppgifterna kunde inte hämtas.")
        verify(overview).overview(actor)
    }

    @Test
    fun `personal activities and team catalog obey a narrowed club and team scope`() {
        val foreignOrg = UUID.randomUUID()
        val foreignTeam = UUID.randomUUID()
        val local = snapshot(2)
        val foreign = local.activities.first().copy(
            organization = organization.copy(id = foreignOrg),
            team = team.copy(id = foreignTeam, organization_id = foreignOrg),
        )
        `when`(overview.overview(actor)).thenReturn(local.copy(activities = local.activities + foreign))
        `when`(activityData.catalogTeams(actor)).thenReturn(listOf(
            AssistantTeam(team.id, organization.id, team.name),
            AssistantTeam(foreignTeam, foreignOrg, "Annan klubb"),
        ))
        val scoped = AssistantToolScope.context(actor, organization.id, team.id)

        assertThat(service.listMyActivities(scoped).activities.map { it.id }).containsExactlyElementsOf(local.activities.map { it.id })
        assertThat(service.listTeams(null, scoped).teams.map { it.id }).containsExactly(team.id)
    }

    @Test
    fun `team catalog combines personal and managed teams with stable bounded pages`() {
        `when`(overview.overview(actor)).thenReturn(snapshot(0))
        val managed = List(26) { index -> AssistantTeam(UUID(0, index.toLong() + 1), organization.id, "Lag $index") }
        `when`(activityData.catalogTeams(actor)).thenReturn(managed)

        val first = service.listTeams(null, context)
        val second = service.listTeams(first.nextOffset, context)

        assertThat(first.teams).hasSize(25)
        assertThat(first.limit).isEqualTo(25)
        assertThat(first.truncated).isTrue()
        assertThat(first.nextOffset).isEqualTo(25)
        assertThat(second.teams).hasSize(2)
        assertThat(second.truncated).isFalse()
        assertThat(second.nextOffset).isNull()
        assertThat((first.teams + second.teams).map { it.id }).doesNotHaveDuplicates()
        assertThatThrownBy { service.listTeams(-1, context) }.isInstanceOf(IllegalArgumentException::class.java)
    }

    @Test
    fun `team overview returns five minimized activities from the actual authorized team`() {
        val snapshot = snapshot(6)
        val upcoming = snapshot.activities.map { it.copy(status = "scheduled") }
        val ended = upcoming.first().copy(
            id = UUID.randomUUID(), title = "Avslutad träning",
            starts_at = snapshot.reference_time.minusSeconds(3600), ends_at = snapshot.reference_time,
        )
        val cancelled = upcoming.first().copy(id = UUID.randomUUID(), title = "Inställd träning", status = "cancelled")
        `when`(overview.overview(actor)).thenReturn(snapshot)
        `when`(activityData.team(actor, team.id)).thenReturn(teamData())
        `when`(activityData.catalogActivities(actor)).thenReturn(listOf(ended, cancelled) + upcoming + upcoming.first().copy(
            team = team.copy(id = UUID.randomUUID()), title = "Privat annat lag",
        ))

        val result = service.getTeamOverview(team.id, context)
        val payload = JsonMapper.builder().build().writeValueAsString(result)

        assertThat(result.activities).hasSize(5)
        assertThat(result.activities.map { it.id }).containsExactlyElementsOf(upcoming.take(5).map { it.id })
        assertThat(result.timeZone).isEqualTo("Europe/Stockholm")
        assertThat(result.limit).isEqualTo(5)
        assertThat(result.truncated).isTrue()
        assertThat(payload).doesNotContain(
            "Avslutad träning", "Inställd träning", "Privat personnamn", "Privat svarskommentar", "Privat annat lag", "editor", "roster", "instructions",
        )
    }

    @Test
    fun `a club scoped assistant cannot read another club even with business permission`() {
        val otherOrganization = UUID.randomUUID()
        `when`(activityData.team(actor, team.id)).thenReturn(teamData().copy(organizationId = otherOrganization))
        val scoped = AssistantToolScope.context(actor, organization.id)

        assertThatThrownBy { service.getTeamOverview(team.id, scoped) }.isInstanceOf(AccessDeniedException::class.java)
        assertThatThrownBy { service.getTeamMemberNames(team.id, scoped) }.isInstanceOf(AccessDeniedException::class.java)
        assertThatThrownBy { service.getAcceptedParticipantNames(team.id, UUID.randomUUID(), scoped) }.isInstanceOf(AccessDeniedException::class.java)
        verifyNoInteractions(access)
    }

    @Test
    fun `family access never grants team member names or accepted participant names`() {
        `when`(activityData.team(actor, team.id)).thenReturn(teamData())

        assertThatThrownBy { service.getTeamMemberNames(team.id, context) }.isInstanceOf(AccessDeniedException::class.java)
        assertThatThrownBy { service.getAcceptedParticipantNames(team.id, UUID.randomUUID(), context) }.isInstanceOf(AccessDeniedException::class.java)
    }

    @Test
    fun `roster names are deduplicated by person bounded and omit roles and identifiers`() {
        val people = List(501) { AssistantRosterPerson(UUID.randomUUID(), "Namn $it", "Privat medlemsroll") }
        `when`(activityData.team(actor, team.id)).thenReturn(teamData().copy(roster = people + people.first()))
        `when`(access.canManageRoster(actor, team.id)).thenReturn(true)

        val result = service.getTeamMemberNames(team.id, context)

        assertThat(result.names).hasSize(500)
        assertThat(result.limit).isEqualTo(500)
        assertThat(result.truncated).isTrue()
        assertThat(JsonMapper.builder().build().writeValueAsString(result)).doesNotContain("Privat medlemsroll", people.first().id.toString())
    }

    @Test
    fun `accepted names require the activitys real team and never include comments or other responses`() {
        val activity = snapshot(1).activities.single()
        `when`(activityData.team(actor, team.id)).thenReturn(teamData())
        `when`(access.canManageInvitations(actor, team.id)).thenReturn(true)
        `when`(activityData.activity(actor, activity.id)).thenReturn(activity)
        val person = UUID.randomUUID()
        `when`(activityData.invitations(actor, activity.id)).thenReturn(listOf(
            AssistantInvitation(UUID.randomUUID(), person, "Godkänd", "accepted", "Privat svarskommentar", 1),
            AssistantInvitation(UUID.randomUUID(), person, "Godkänd", "accepted", null, 1),
            AssistantInvitation(UUID.randomUUID(), UUID.randomUUID(), "Avböjd", "declined", null, 1),
        ))

        val result = service.getAcceptedParticipantNames(team.id, activity.id, context)

        assertThat(result.names).containsExactly("Godkänd")
        assertThat(result.truncated).isFalse()
        assertThat(JsonMapper.builder().build().writeValueAsString(result)).doesNotContain("Privat svarskommentar", "Avböjd", person.toString())
        `when`(activityData.activity(actor, activity.id)).thenReturn(activity.copy(team = team.copy(id = UUID.randomUUID())))
        assertThatThrownBy { service.getAcceptedParticipantNames(team.id, activity.id, context) }.isInstanceOf(AccessDeniedException::class.java)
        `when`(activityData.activity(actor, activity.id)).thenReturn(activity.copy(organization = organization.copy(id = UUID.randomUUID())))
        assertThatThrownBy { service.getAcceptedParticipantNames(team.id, activity.id, context) }.isInstanceOf(AccessDeniedException::class.java)
        verify(activityData).invitations(actor, activity.id)
    }

    @ParameterizedTest
    @ValueSource(booleans = [false, true])
    fun `MCP invitation read uses the verified actor and preserves the domain result scope`(wholeActivity: Boolean) {
        val activity = snapshot(1).activities.single()
        val invitations = listOf(
            AssistantInvitation(UUID.randomUUID(), UUID.randomUUID(), "Deltagare", "accepted", "Egen behörig kommentar", 2),
            AssistantInvitation(UUID.randomUUID(), UUID.randomUUID(), "Annan deltagare", "pending", null, 1),
        )
        `when`(activityData.activity(actor, activity.id)).thenReturn(activity)
        `when`(activityData.team(actor, team.id)).thenReturn(teamData().copy(invitationAccess = wholeActivity))
        `when`(activityData.invitations(actor, activity.id)).thenReturn(invitations)

        val result = call("get_activity_invitations", mapOf("activityId" to activity.id.toString()))

        assertThat(result.isError()).isFalse()
        val payload = payload(result)
        assertThat(payload.path("invitationSummaryScope").asString())
            .isEqualTo(if (wholeActivity) "whole_activity" else "visible_people_only")
        assertThat(payload.path("invitations").size()).isEqualTo(2)
        assertThat(payload.path("invitations").first().path("id").asString()).isEqualTo(invitations.first().id.toString())
        assertThat(payload.path("invitationSummary").path("accepted").asInt()).isEqualTo(1)
        assertThat(payload.path("invitationSummary").path("pending").asInt()).isEqualTo(1)
        assertThat(payload.path("truncated").asBoolean()).isFalse()
        assertThat(payload.toString()).doesNotContain(actor.bearerToken, actor.subject.toString(), actor.session.toString())
        verify(activityData).activity(actor, activity.id)
        verify(activityData).team(actor, team.id)
        verify(activityData).invitations(actor, activity.id)
    }

    @Test
    fun `MCP invitation read preserves a domain denial without exposing its details`() {
        val activityId = UUID.randomUUID()
        `when`(activityData.activity(actor, activityId))
            .thenThrow(AccessDeniedException("private permission and database details ${actor.bearerToken}"))

        val result = call("get_activity_invitations", mapOf("activityId" to activityId.toString()))

        assertThat(result.isError()).isTrue()
        assertThat((result.content().single() as McpSchema.TextContent).text()).isEqualTo("Uppgifterna kunde inte hämtas.")
        verify(activityData).activity(actor, activityId)
        verify(activityData, never()).invitations(actor, activityId)
        verifyNoInteractions(documents, members, attendance, duties, signals)
    }

    @Test
    fun `MCP document read accepts an omitted optional team without widening identity`() {
        val arguments = mapOf("organizationId" to organization.id.toString())
        val document = AssistantDocument(UUID.randomUUID(), "Klubbrutin", "Behörigt dokumentunderlag", "members")
        `when`(documents.read(actor, organization.id, null, null)).thenReturn(AssistantDocuments(listOf(document), false))

        val result = call("get_assistant_documents", arguments)

        assertThat(result.isError()).isFalse()
        val payload = payload(result)
        assertThat(payload.path("documents").size()).isEqualTo(1)
        assertThat(payload.path("documents").first().path("content").asString()).isEqualTo(document.content)
        assertThat(payload.toString()).doesNotContain(actor.bearerToken, actor.subject.toString(), actor.session.toString())
        verify(documents).read(actor, organization.id, null, null)
        verifyNoInteractions(activityData)
    }

    @Test
    fun `MCP document schema makes team optional but rejects explicit null before domain access`() {
        val mapper = JsonMapper.builder().build()
        val schema = mapper.readTree(mapper.writeValueAsString(tool("get_assistant_documents").tool().inputSchema()))
        assertThat(schema.path("properties").path("teamId").path("type").asString()).isEqualTo("string")
        assertThat(schema.path("required").toList().map { it.asString() }).doesNotContain("teamId")

        val result = call("get_assistant_documents", mapOf("organizationId" to organization.id.toString(), "teamId" to null))

        assertThat(result.isError()).isTrue()
        assertThat((result.content().single() as McpSchema.TextContent).text()).isEqualTo("Ogiltiga verktygsargument.")
        verifyNoInteractions(activityData, documents)
    }

    @Test
    fun `MCP document read resolves the actual team section and rejects a team from another organization`() {
        val section = UUID.randomUUID()
        val arguments = mapOf("organizationId" to organization.id.toString(), "teamId" to team.id.toString())
        `when`(activityData.team(actor, team.id)).thenReturn(teamData().copy(sectionId = section))
        `when`(documents.read(actor, organization.id, team.id, section)).thenReturn(AssistantDocuments(emptyList(), false))

        val allowed = call("get_assistant_documents", arguments)
        `when`(activityData.team(actor, team.id)).thenReturn(teamData().copy(organizationId = UUID.randomUUID()))
        val denied = call("get_assistant_documents", arguments)

        assertThat(allowed.isError()).isFalse()
        assertThat(payload(allowed).path("documents").size()).isZero()
        assertThat(denied.isError()).isTrue()
        assertThat((denied.content().single() as McpSchema.TextContent).text()).isEqualTo("Uppgifterna kunde inte hämtas.")
        verify(documents).read(actor, organization.id, team.id, section)
        verifyNoMoreInteractions(documents)
    }

    @Test
    fun `MCP history read converts date arguments and passes the verified actor to domain authorization`() {
        val from = LocalDate.of(2026, 10, 1)
        val through = LocalDate.of(2026, 10, 31)
        `when`(activityData.team(actor, team.id)).thenReturn(teamData())
        `when`(activityData.history(actor, team.id, from, through))
            .thenReturn(AssistantHistory(from, through, 0, 0, false, emptyList()))

        val result = call("get_activity_history", mapOf(
            "teamId" to team.id.toString(), "from" to from.toString(), "through" to through.toString(),
        ))

        assertThat(result.isError()).isFalse()
        val payload = payload(result)
        assertThat(payload.path("from").asString()).isEqualTo(from.toString())
        assertThat(payload.path("through").asString()).isEqualTo(through.toString())
        assertThat(payload.path("records").size()).isZero()
        verify(activityData).team(actor, team.id)
        verify(activityData).history(actor, team.id, from, through)
    }

    @Test
    fun `new MCP reads reject missing or wrongly typed transport identity before any domain call`() {
        val requests = listOf(
            "get_activity_invitations" to mapOf("activityId" to UUID.randomUUID().toString()),
            "get_assistant_documents" to mapOf("organizationId" to organization.id.toString()),
            "get_activity_history" to mapOf("teamId" to team.id.toString(), "from" to "2026-10-01", "through" to "2026-10-31"),
        )
        val invalidContexts = listOf(
            McpTransportContext.EMPTY,
            McpTransportContext.create(mapOf(McpConfiguration.ACTOR_CONTEXT_KEY to actor.subject.toString())),
        )
        requests.forEach { (name, arguments) ->
            invalidContexts.forEach { untrusted ->
                val result = call(name, arguments, untrusted)
                assertThat(result.isError()).isTrue()
                assertThat((result.content().single() as McpSchema.TextContent).text()).isEqualTo("Uppgifterna kunde inte hämtas.")
            }
        }
        verifyNoInteractions(overview, activityData, access, attendance, members, documents, duties, signals)
    }

    private fun tool(name: String) = McpConfiguration().readTools(catalog).single { it.tool().name() == name }

    private fun call(name: String, arguments: Map<String, Any?>, caller: McpTransportContext = transport): McpSchema.CallToolResult {
        val request = McpSchema.CallToolRequest.builder(name).arguments(arguments).build()
        return tool(name).callHandler().apply(caller, request)
    }

    private fun payload(result: McpSchema.CallToolResult) =
        JsonMapper.builder().build().readTree((result.content().single() as McpSchema.TextContent).text())

    private fun teamData() = AssistantTeamData(
        team.id, organization.id, team.name, organization.name, null, null, organization.time_zone,
        null, false, false, emptyList(),
    )

    private fun snapshot(count: Int): PersonalOverview {
        val personId = UUID.randomUUID()
        val invitation = AccessibleInvitation(
            UUID.randomUUID(), personId, InvitationResponse.ACCEPTED, "Privat svarskommentar", "Privat personnamn"
        )
        val activities = List(count) { index ->
            PersonalActivity(
                id = UUID.randomUUID(),
                title = "Träning $index",
                starts_at = startsAt.plusSeconds(index * 86400L),
                ends_at = startsAt.plusSeconds(index * 86400L + 3600),
                gathering_at = startsAt.minusSeconds(900),
                response_due_at = startsAt.minusSeconds(86400),
                location = "Testplanen",
                description = "Privat aktivitetsbeskrivning",
                status = "published",
                organization = organization,
                team = team,
                people = listOf(ActivityPerson(personId, "Privat personnamn", invitation)),
                can_manage_activities = false
            )
        }
        return PersonalOverview(startsAt, activities, listOf(organization), listOf(team), emptyList(), emptyList())
    }
}
