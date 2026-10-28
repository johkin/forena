package se.forena.api.assistant

import java.util.UUID
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.access.AccessDeniedException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import se.forena.api.identity.Actor
import se.forena.api.identity.SessionService

data class MemoryEdit(val revision: Long, val content: String)

@Service
class AssistantMemoryService(
    private val jdbc: JdbcClient,
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
        return jdbc
            .sql(
                """select * from forena.assistant_memory where
            subject is not distinct from cast(:subject as uuid) and organization_id is not distinct from cast(:org as uuid)
            and section_id is not distinct from cast(:section as uuid) and team_id is not distinct from cast(:team as uuid)
            order by created_at,id"""
            )
            .param("subject", if (scope == "personal") actor.subject else null)
            .param("org", organization)
            .param("section", section)
            .param("team", team)
            .query(AssistantMemory::class.java)
            .list()
            .map { requireNotNull(it) }
    }

    @Transactional
    fun update(actor: Actor, id: UUID, edit: MemoryEdit) {
        val memory = authorize(actor, id)
        require(edit.content.trim().length in 1..2000)
        check(memory.revision == edit.revision)
        jdbc
            .sql(
                "update forena.assistant_memory set content=:content,revision=revision+1 where id=:id"
            )
            .param("content", edit.content.trim())
            .param("id", id)
            .update()
        audit(actor, id, "updated")
    }

    @Transactional
    fun delete(actor: Actor, id: UUID, revision: Long) {
        val memory = authorize(actor, id)
        check(memory.revision == revision)
        jdbc.sql("delete from forena.assistant_memory where id=:id").param("id", id).update()
        audit(actor, id, "deleted")
    }

    private fun authorize(actor: Actor, id: UUID): AssistantMemory {
        sessions.requireActive(actor)
        val memory =
            jdbc
                .sql("select * from forena.assistant_memory where id=:id for update")
                .param("id", id)
                .query(AssistantMemory::class.java)
                .optional()
                .orElseThrow { NoSuchElementException() }
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
        return memory
    }

    private fun audit(actor: Actor, id: UUID, operation: String) {
        jdbc
            .sql(
                "insert into forena.assistant_memory_audit(memory_id,actor_subject,operation) values(:id,:actor,:operation)"
            )
            .param("id", id)
            .param("actor", actor.subject)
            .param("operation", operation)
            .update()
    }
}
