package se.forena.api.assistant

import java.util.UUID
import org.springframework.security.access.AccessDeniedException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import se.forena.api.assistant.internal.AssistantMemoryRepository
import se.forena.api.identity.Actor
import se.forena.api.identity.SessionService

@Service
class AssistantMemoryService(
    private val repository: AssistantMemoryRepository,
    private val sessions: SessionService,
    private val profiles: AssistantProfileService,
) {
    @Transactional(readOnly = true)
    fun list(
        actor: Actor,
        scope: String,
        organization: UUID?,
        section: UUID?,
        team: UUID?,
    ): List<AssistantMemory> {
        val target = MemoryDraft(scope, organization, section, team, content = "Kontroll av mål")
        profiles.validateMemory(actor, target)
        return repository.findInScope(
            if (scope == "personal") actor.subject else null,
            organization,
            section,
            team,
        )
    }

    @Transactional
    fun update(actor: Actor, id: UUID, edit: MemoryEdit) {
        val memory = authorize(actor, id)
        require(edit.content.trim().length in 1..2000)
        check(memory.revision == edit.revision)
        repository.updateContent(edit.content.trim(), id)
        audit(actor, id, "updated")
    }

    @Transactional
    fun delete(actor: Actor, id: UUID, revision: Long) {
        val memory = authorize(actor, id)
        check(memory.revision == revision)
        repository.delete(id)
        audit(actor, id, "deleted")
    }

    private fun authorize(actor: Actor, id: UUID): AssistantMemory {
        sessions.requireActive(actor)
        val memory = repository.find(id).orElseThrow { NoSuchElementException() }
        if (memory.subject != null && memory.subject != actor.subject)
            throw AccessDeniedException("Private memory")
        val scope =
            when {
                memory.subject != null -> "personal"
                memory.teamId != null -> "team"
                memory.sectionId != null -> "section"
                else -> "organization"
            }
        profiles.validateMemory(
            actor,
            MemoryDraft(
                scope,
                memory.organizationId,
                memory.sectionId,
                memory.teamId,
                memory.disciplineKey,
                memory.content,
            ),
        )
        val current = repository.findLocked(id).orElseThrow { NoSuchElementException() }
        check(
            current.subject == memory.subject &&
                current.organizationId == memory.organizationId &&
                current.sectionId == memory.sectionId &&
                current.teamId == memory.teamId &&
                current.disciplineKey == memory.disciplineKey
        )
        return current
    }

    private fun audit(actor: Actor, id: UUID, operation: String) {
        repository.auditChange(id, actor.subject, operation)
    }
}
