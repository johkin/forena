package se.forena.api.assistant.internal

import java.util.Optional
import java.util.UUID
import org.springframework.data.jdbc.repository.query.Modifying
import org.springframework.data.jdbc.repository.query.Query
import org.springframework.data.repository.Repository as DataRepository
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository as JdbcRepository
import se.forena.api.assistant.*

@JdbcRepository
class ConversationRepository(private val jdbc: JdbcClient) {
    fun lockAccount(subject: UUID) {
        jdbc
            .sql("select subject from forena.account where subject=:subject for update")
            .param("subject", subject)
            .query(UUID::class.java)
            .single()
    }

    fun list(subject: UUID): List<Conversation> =
        jdbc
            .sql(
                "select * from forena.assistant_conversation where subject=:subject order by updated_at desc,id"
            )
            .param("subject", subject)
            .query(Conversation::class.java)
            .list()
            .map { requireNotNull(it) }

    fun find(subject: UUID, id: UUID, lock: Boolean = false): Conversation =
        jdbc
            .sql(
                "select * from forena.assistant_conversation where subject=:subject and id=:id" +
                    if (lock) " for update" else ""
            )
            .param("subject", subject)
            .param("id", id)
            .query(Conversation::class.java)
            .optional()
            .orElseThrow { NoSuchElementException() }

    fun active(subject: UUID, channel: String, organization: UUID?): Conversation? =
        jdbc
            .sql(
                "select * from forena.assistant_conversation where subject=:subject and channel=:channel and organization_id is not distinct from cast(:org as uuid) and active"
            )
            .param("subject", subject)
            .param("channel", channel)
            .param("org", organization)
            .query(Conversation::class.java)
            .optional()
            .orElse(null)

    fun new(subject: UUID, channel: String, org: UUID?, team: UUID?): Conversation {
        jdbc
            .sql("select subject from forena.account where subject=:subject for update")
            .param("subject", subject)
            .query(UUID::class.java)
            .single()
        active(subject, channel, org)?.let { old ->
            invalidate(subject, old.id)
            jdbc
                .sql(
                    "update forena.assistant_conversation set active=false where id=:id and subject=:subject"
                )
                .param("id", old.id)
                .param("subject", subject)
                .update()
        }
        val id = UUID.randomUUID()
        jdbc
            .sql(
                "insert into forena.assistant_conversation(id,subject,organization_id,channel,team_id) values(:id,:subject,:org,:channel,:team)"
            )
            .param("id", id)
            .param("subject", subject)
            .param("org", org)
            .param("channel", channel)
            .param("team", team)
            .update()
        return find(subject, id)
    }

    fun resume(subject: UUID, id: UUID): Conversation {
        jdbc
            .sql("select subject from forena.account where subject=:subject for update")
            .param("subject", subject)
            .query(UUID::class.java)
            .single()
        val chosen = find(subject, id, true)
        require(chosen.channel == "web")
        active(subject, "web", chosen.organizationId)
            ?.takeIf { it.id != id }
            ?.let { previous ->
                invalidate(subject, previous.id)
                jdbc
                    .sql(
                        "update forena.assistant_conversation set active=false where subject=:subject and id=:id"
                    )
                    .param("subject", subject)
                    .param("id", previous.id)
                    .update()
            }
        jdbc
            .sql(
                "update forena.assistant_conversation set active=true,updated_at=clock_timestamp() where subject=:subject and id=:id"
            )
            .param("subject", subject)
            .param("id", id)
            .update()
        return find(subject, id)
    }

    fun invalidate(subject: UUID, id: UUID) {
        jdbc
            .sql(
                "update forena.assistant_proposal set state='invalid' where subject=:subject and conversation_id=:id and state='pending'"
            )
            .param("subject", subject)
            .param("id", id)
            .update()
    }

    fun delete(subject: UUID, id: UUID) {
        find(subject, id, true)
        jdbc
            .sql("delete from forena.assistant_conversation where id=:id and subject=:subject")
            .param("id", id)
            .param("subject", subject)
            .update()
    }

    fun messages(id: UUID): List<AssistantMessage> =
        jdbc
            .sql(
                "select * from forena.assistant_message where conversation_id=:id order by created_at,id"
            )
            .param("id", id)
            .query(AssistantMessage::class.java)
            .list()
            .map { requireNotNull(it) }

    fun routedQuestion(conversation: Conversation, org: UUID, content: String) {
        jdbc
            .sql(
                "insert into forena.assistant_routed_question(id,conversation_id,organization_id,content) values(:id,:conversation,:org,:content)"
            )
            .param("id", UUID.randomUUID())
            .param("conversation", conversation.id)
            .param("org", org)
            .param("content", content)
            .update()
    }

    fun clubContext(conversation: UUID, organization: UUID): List<Map<String, String>> =
        jdbc
            .sql(
                """
        select role,content from (
            select role,content,created_at,id from forena.assistant_message
                where conversation_id=:conversation and organization_id=:org
            union all select 'user',content,created_at,id from forena.assistant_routed_question
                where conversation_id=:conversation and organization_id=:org
        ) context order by created_at desc,id desc limit 12
        """
            )
            .param("conversation", conversation)
            .param("org", organization)
            .query { row, _ ->
                mapOf("role" to row.getString("role"), "content" to row.getString("content"))
            }
            .list()
            .map { requireNotNull(it) }
            .reversed()

    fun message(id: UUID, role: String, sender: String, org: UUID?, text: String) {
        jdbc
            .sql(
                "insert into forena.assistant_message(id,conversation_id,role,sender,organization_id,content) values(:id,:conversation,:role,:sender,:org,:content)"
            )
            .param("id", UUID.randomUUID())
            .param("conversation", id)
            .param("role", role)
            .param("sender", sender)
            .param("org", org)
            .param("content", text.take(30000))
            .update()
    }

    fun advance(conversation: Conversation, team: UUID?, activity: UUID?): Conversation {
        check(
            jdbc
                .sql(
                    "update forena.assistant_conversation set revision=revision+1,updated_at=clock_timestamp(),team_id=:team,activity_id=:activity where id=:id and subject=:subject and revision=:revision"
                )
                .param("team", team)
                .param("activity", activity)
                .param("id", conversation.id)
                .param("subject", conversation.subject)
                .param("revision", conversation.revision)
                .update() == 1
        )
        return find(conversation.subject, conversation.id)
    }

    fun proposals(subject: UUID, conversation: UUID): List<AssistantProposal> =
        jdbc
            .sql(
                "select * from forena.assistant_proposal where subject=:subject and conversation_id=:conversation order by created_at,id"
            )
            .param("subject", subject)
            .param("conversation", conversation)
            .query(AssistantProposal::class.java)
            .list()
            .map { requireNotNull(it) }

    fun proposalConversation(subject: UUID, id: UUID): UUID =
        jdbc
            .sql(
                "select conversation_id from forena.assistant_proposal where id=:id and subject=:subject"
            )
            .param("id", id)
            .param("subject", subject)
            .query(UUID::class.java)
            .optional()
            .orElseThrow { NoSuchElementException() }

    fun context(conversation: Conversation, team: UUID?, activity: UUID?) {
        check(
            jdbc
                .sql(
                    "update forena.assistant_conversation set team_id=:team,activity_id=:activity where id=:id and subject=:subject and active and revision=:revision"
                )
                .param("id", conversation.id)
                .param("subject", conversation.subject)
                .param("revision", conversation.revision)
                .param("team", team)
                .param("activity", activity)
                .update() == 1
        )
    }

    fun proposal(subject: UUID, id: UUID): AssistantProposal =
        jdbc
            .sql(
                "select * from forena.assistant_proposal where id=:id and subject=:subject for update"
            )
            .param("subject", subject)
            .param("id", id)
            .query(AssistantProposal::class.java)
            .optional()
            .orElseThrow { NoSuchElementException() }

    fun propose(
        conversation: Conversation,
        kind: String,
        label: String,
        payload: String,
        fingerprint: String,
        target: AssistantTarget? = null,
    ): AssistantProposal {
        val id = UUID.randomUUID()
        jdbc
            .sql(
                "insert into forena.assistant_proposal(id,conversation_id,subject,organization_id,team_id,kind,label,payload,fingerprint) values(:id,:conversation,:subject,:org,:team,:kind,:label,:payload,:fingerprint)"
            )
            .param("id", id)
            .param("conversation", conversation.id)
            .param("subject", conversation.subject)
            .param("kind", kind)
            .param("org", target?.organizationId)
            .param("team", target?.teamId)
            .param("label", label)
            .param("payload", payload)
            .param("fingerprint", fingerprint)
            .update()
        return proposal(conversation.subject, id)
    }

    fun invalidateProposal(subject: UUID, id: UUID) {
        jdbc
            .sql(
                "update forena.assistant_proposal set state='invalid' where id=:id and subject=:subject and state='pending'"
            )
            .param("id", id)
            .param("subject", subject)
            .update()
    }

    fun finish(subject: UUID, id: UUID) {
        check(
            jdbc
                .sql(
                    "update forena.assistant_proposal set state='completed' where id=:id and subject=:subject and state='pending'"
                )
                .param("id", id)
                .param("subject", subject)
                .update() == 1
        )
    }

    fun budget(subject: UUID) {
        // Serialize admission per account, including failed model calls. Keep history bounded.
        jdbc
            .sql("select subject from forena.account where subject=:subject for update")
            .param("subject", subject)
            .query(UUID::class.java)
            .single()
        jdbc
            .sql(
                "delete from forena.assistant_usage where subject=:subject and bucket<clock_timestamp()-interval '1 hour'"
            )
            .param("subject", subject)
            .update()
        val hour =
            jdbc
                .sql(
                    "select coalesce(sum(questions),0) from forena.assistant_usage where subject=:subject"
                )
                .param("subject", subject)
                .query(Long::class.java)
                .single()
        val minute =
            jdbc
                .sql(
                    "select coalesce(sum(questions),0) from forena.assistant_usage where subject=:subject and bucket>=date_trunc('minute',clock_timestamp())"
                )
                .param("subject", subject)
                .query(Long::class.java)
                .single()
        if (hour >= 30 || minute >= 5)
            throw org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.TOO_MANY_REQUESTS
            )
        jdbc
            .sql(
                "insert into forena.assistant_usage(subject,bucket,questions) values(:subject,date_trunc('minute',clock_timestamp()),1) on conflict(subject,bucket) do update set questions=forena.assistant_usage.questions+1"
            )
            .param("subject", subject)
            .update()
    }
}

interface AssistantDocumentRepository : DataRepository<AssistantDocumentEntity, UUID> {
    @Query(
        """select id,title,content,audience from forena.assistant_document
            where organization_id=:org and (section_id is null or section_id=:section) and (team_id is null or team_id=:team)
            and (audience='all' or (audience='players' and :player) or (audience='guardians' and :guardian) or (audience='leaders' and :leader))
            order by title,id limit 11"""
    )
    fun findVisibleDocuments(
        org: UUID,
        team: UUID?,
        section: UUID?,
        player: Boolean,
        guardian: Boolean,
        leader: Boolean,
    ): List<AssistantDocument>
}

interface AssistantMemoryRepository : DataRepository<AssistantMemoryEntity, UUID> {
    @Query("select * from forena.assistant_memory where id=:id")
    fun find(id: UUID): Optional<AssistantMemory>

    @Query(
        """select * from forena.assistant_memory where
            subject is not distinct from cast(:subject as uuid) and organization_id is not distinct from cast(:org as uuid)
            and section_id is not distinct from cast(:section as uuid) and team_id is not distinct from cast(:team as uuid)
            order by created_at,id"""
    )
    fun findInScope(subject: UUID?, org: UUID?, section: UUID?, team: UUID?): List<AssistantMemory>

    @Modifying
    @Query("update forena.assistant_memory set content=:content,revision=revision+1 where id=:id")
    fun updateContent(content: String, id: UUID): Int

    @Modifying @Query("delete from forena.assistant_memory where id=:id") fun delete(id: UUID): Int

    @Query("select * from forena.assistant_memory where id=:id for update")
    fun findLocked(id: UUID): Optional<AssistantMemory>

    @Modifying
    @Query(
        "insert into forena.assistant_memory_audit(memory_id,actor_subject,operation) values(:id,:actor,:operation)"
    )
    fun auditChange(id: UUID, actor: UUID, operation: String): Int
}

interface AssistantProfileRepository : DataRepository<AssistantProfileEntity, UUID> {
    @Query(
        "select exists(select 1 from forena.organization_member where subject=:subject and organization_id=:org and active and role in ('owner','admin'))"
    )
    fun isClubAdministrator(subject: UUID, org: UUID): Boolean

    @Query(
        "select exists(select 1 from forena.section_administrator where subject=:subject and section_id=:section and organization_id=:org and active)"
    )
    fun isSectionAdministrator(subject: UUID, section: UUID, org: UUID): Boolean

    @Query("select exists(select 1 from forena.section where id=:section and organization_id=:org)")
    fun sectionBelongsToOrganization(section: UUID, org: UUID): Boolean

    @Query(
        "select name,personality,instructions,revision from forena.assistant_profile where organization_id=:org"
    )
    fun findProfile(org: UUID): Optional<AssistantProfile>

    @Query("select id from forena.organization where id=:org for update")
    fun lockOrganization(org: UUID): UUID

    @Query("select revision from forena.assistant_profile where organization_id=:org")
    fun profileRevision(org: UUID): Optional<Long>

    @Modifying
    @Query(
        "insert into forena.assistant_profile(organization_id,name,personality,instructions,revision) values(:org,:name,:personality,:instructions,:revision) on conflict(organization_id) do update set name=:name,personality=:personality,instructions=:instructions,revision=:revision"
    )
    fun saveProfile(
        org: UUID,
        name: String,
        personality: String,
        instructions: String,
        revision: Long,
    ): Int

    @Modifying
    @Query(
        "insert into forena.assistant_profile_audit(subject,organization_id,revision) values(:subject,:org,:revision)"
    )
    fun auditProfile(subject: UUID, org: UUID, revision: Long): Int

    @Query(
        "select instructions,revision from forena.assistant_section_profile where section_id=:section"
    )
    fun findSectionProfile(section: UUID): Optional<SectionProfile>

    @Query("select id from forena.section where id=:section for update")
    fun lockSection(section: UUID): UUID

    @Query("select revision from forena.assistant_section_profile where section_id=:section")
    fun sectionRevision(section: UUID): Optional<Long>

    @Modifying
    @Query(
        "insert into forena.assistant_section_profile(section_id,instructions,revision) values(:section,:instructions,:revision) on conflict(section_id) do update set instructions=:instructions,revision=:revision"
    )
    fun saveSectionProfile(section: UUID, instructions: String, revision: Long): Int

    @Modifying
    @Query(
        "insert into forena.assistant_profile_audit(subject,organization_id,section_id,revision) values(:subject,:org,:section,:revision)"
    )
    fun auditSectionProfile(subject: UUID, org: UUID, section: UUID, revision: Long): Int

    @Query(
        "select exists(select 1 from forena.team where id=:team and organization_id=:org and (:noSection or section_id=:section))"
    )
    fun teamMatchesScope(team: UUID?, org: UUID?, noSection: Boolean, section: UUID?): Boolean

    @Modifying
    @Query(
        "insert into forena.assistant_memory(id,subject,organization_id,section_id,team_id,discipline_key,content,created_by) values(:id,:subject,:org,:section,:team,:discipline,:content,:actor)"
    )
    fun insertMemory(
        id: UUID,
        subject: UUID?,
        org: UUID?,
        section: UUID?,
        team: UUID?,
        discipline: String?,
        content: String,
        actor: UUID,
    ): Int

    @Query(
        """select * from forena.assistant_memory where subject=:subject or
            (subject is null and organization_id=:org and (section_id is null or section_id=:section)
            and (team_id is null or team_id=:team) and (discipline_key is null or discipline_key=:discipline))
            order by (team_id is not null),(section_id is not null),created_at,id"""
    )
    fun findApplicableMemories(
        subject: UUID,
        org: UUID?,
        section: UUID?,
        team: UUID?,
        discipline: String?,
    ): List<AssistantMemory>
}
