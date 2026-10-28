package se.forena.api.assistant

import java.util.UUID

data class AssistantDocument(
    val id: UUID,
    val title: String,
    val content: String,
    val audience: String,
)

data class AssistantDocuments(val documents: List<AssistantDocument>, val truncated: Boolean)
