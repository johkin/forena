package se.forena.api.assistant

import java.util.UUID
import org.springframework.ai.tool.ToolCallback
import org.springframework.ai.tool.method.MethodToolCallbackProvider
import org.springframework.stereotype.Component
import se.forena.api.identity.Actor

/** One explicit registry of read-only callbacks for the assistant and MCP. */
@Component
class AssistantToolCatalog(shared: SharedActivityTools, assistant: AssistantReadTools) {
    val callbacks: List<ToolCallback> =
        MethodToolCallbackProvider.builder().toolObjects(shared, assistant).build().toolCallbacks.toList()

    fun forClub(actor: Actor, organizationId: UUID, teamId: UUID?): AssistantToolSet =
        AssistantToolSet(callbacks, AssistantToolScope.context(actor, organizationId, teamId))
}
