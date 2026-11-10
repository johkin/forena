package se.forena.api.mcp

import io.modelcontextprotocol.common.McpTransportContext
import org.springframework.ai.chat.model.ToolContext
import org.springframework.ai.mcp.McpToolUtils
import org.springframework.ai.tool.annotation.Tool
import org.springframework.security.authentication.BadCredentialsException
import org.springframework.stereotype.Service
import se.forena.api.activities.PersonalOverviewService
import se.forena.api.identity.Actor

@Service
class McpActivityService(private val overview: PersonalOverviewService) {
    @Tool(
        name = "list_my_activities",
        description = "Läs dina och familjens kommande aktiviteter. Inga kontaktuppgifter eller svarskommentarer."
    )
    fun listMyActivities(context: ToolContext): McpActivities {
        // The transport captures the verified caller before any scheduler/thread change.
        val transport = context.context[McpToolUtils.TOOL_CONTEXT_MCP_EXCHANGE_KEY] as? McpTransportContext
        val actor = transport?.get(ACTOR_CONTEXT_KEY) as? Actor
            ?: throw BadCredentialsException("Missing MCP identity")
        val snapshot = overview.overview(actor).activities
        val activities = snapshot.take(ACTIVITY_LIMIT).map {
            McpActivity(it.id, it.title, it.starts_at, it.ends_at, it.organization.name, it.team.name, it.location)
        }
        return McpActivities(activities, ACTIVITY_LIMIT, snapshot.size > ACTIVITY_LIMIT)
    }

    companion object {
        const val ACTOR_CONTEXT_KEY = "forena.mcp.actor"
        private const val ACTIVITY_LIMIT = 50
    }
}
