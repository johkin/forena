package se.forena.api.mcp

import io.modelcontextprotocol.common.McpTransportContext
import io.modelcontextprotocol.spec.McpSchema
import java.time.Instant
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit.SECONDS
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.mockito.Mockito.mock
import org.mockito.Mockito.verify
import org.mockito.Mockito.verifyNoInteractions
import org.mockito.Mockito.`when`
import org.springframework.ai.chat.model.ToolContext
import org.springframework.ai.mcp.McpToolUtils
import org.springframework.security.authentication.BadCredentialsException
import se.forena.api.activities.AccessibleInvitation
import se.forena.api.activities.ActivityPerson
import se.forena.api.activities.InvitationResponse
import se.forena.api.activities.PersonalActivity
import se.forena.api.activities.PersonalOrganization
import se.forena.api.activities.PersonalOverview
import se.forena.api.activities.PersonalOverviewService
import se.forena.api.activities.PersonalTeam
import se.forena.api.identity.Actor
import tools.jackson.databind.json.JsonMapper

class McpActivityServiceTest {
    private val overview = mock(PersonalOverviewService::class.java)
    private val service = McpActivityService(overview)
    private val actor = Actor(UUID.randomUUID(), UUID.randomUUID(), "synthetic-private-oauth-token")
    private val transport = McpTransportContext.create(mapOf(McpActivityService.ACTOR_CONTEXT_KEY to actor))
    private val context = ToolContext(mapOf(McpToolUtils.TOOL_CONTEXT_MCP_EXCHANGE_KEY to transport))
    private val startsAt = Instant.parse("2026-11-10T17:00:00Z")
    private val organization = PersonalOrganization(UUID.randomUUID(), "Testföreningen", "Europe/Stockholm", null)
    private val team = PersonalTeam(UUID.randomUUID(), organization.id, "Testlaget", listOf("participant"))

    @Test
    fun `annotated tool keeps the verified actor across threads and exports only fifty minimized activities`() {
        val snapshot = snapshot(51)
        `when`(overview.overview(actor)).thenReturn(snapshot)
        val tool = McpConfiguration().activityTools(service).single()
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
    fun `missing or untrusted transport identity is rejected before reading activities`() {
        val invalidContexts = listOf(
            ToolContext(emptyMap()),
            ToolContext(mapOf(McpActivityService.ACTOR_CONTEXT_KEY to actor)),
            ToolContext(mapOf(McpToolUtils.TOOL_CONTEXT_MCP_EXCHANGE_KEY to McpTransportContext.EMPTY)),
            ToolContext(mapOf(McpToolUtils.TOOL_CONTEXT_MCP_EXCHANGE_KEY to
                McpTransportContext.create(mapOf(McpActivityService.ACTOR_CONTEXT_KEY to actor.subject.toString()))))
        )

        invalidContexts.forEach { invalid ->
            assertThatThrownBy { service.listMyActivities(invalid) }.isInstanceOf(BadCredentialsException::class.java)
        }

        verifyNoInteractions(overview)
    }

    @Test
    fun `tool failures do not export exception details`() {
        `when`(overview.overview(actor)).thenThrow(IllegalStateException("private database and connection details"))
        val tool = McpConfiguration().activityTools(service).single()
        val request = McpSchema.CallToolRequest.builder("list_my_activities").arguments(emptyMap()).build()

        val result = tool.callHandler().apply(transport, request)

        assertThat(result.isError()).isTrue()
        val text = (result.content().single() as McpSchema.TextContent).text()
        assertThat(text).isEqualTo("Aktiviteterna kunde inte hämtas.")
    }

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
