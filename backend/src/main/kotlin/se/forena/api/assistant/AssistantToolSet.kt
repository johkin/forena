package se.forena.api.assistant

import org.springframework.ai.chat.model.ToolContext
import org.springframework.ai.tool.ToolCallback

/** Server-selected callbacks and identity; the context is never sent to the model. */
data class AssistantToolSet(val callbacks: List<ToolCallback>, val context: ToolContext)
