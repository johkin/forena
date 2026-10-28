package se.forena.api.assistant.internal

import java.util.UUID
import org.springframework.data.annotation.Id
import org.springframework.data.relational.core.mapping.Table

@Table(value = "assistant_memory", schema = "forena")
data class AssistantMemoryEntity(@Id val id: UUID)

@Table(value = "assistant_document", schema = "forena")
data class AssistantDocumentEntity(@Id val id: UUID)

@Table(value = "assistant_profile", schema = "forena")
data class AssistantProfileEntity(@Id val organizationId: UUID)
