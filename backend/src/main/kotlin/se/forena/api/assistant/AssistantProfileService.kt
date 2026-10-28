package se.forena.api.assistant

import java.util.UUID
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.access.AccessDeniedException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import se.forena.api.activities.ActivityManagementService
import se.forena.api.activities.PersonalOverviewService
import se.forena.api.identity.Actor
import se.forena.api.identity.SessionService

@Service
class AssistantProfileService(
    private val jdbc: JdbcClient,
    private val sessions: SessionService,
    private val overview: PersonalOverviewService,
    private val management: ActivityManagementService,
    private val identities: se.forena.api.identity.AssistantIdentityService,
) {
    fun requireOrganization(actor: Actor, org: UUID) {
        sessions.requireActive(actor)
        if (identities.organizations(actor).none { it.id == org })
            throw AccessDeniedException("Organization access required")
    }

    fun requireAdmin(actor: Actor, org: UUID, section: UUID? = null) {
        sessions.requireActive(actor)
        val club =
            jdbc
                .sql(
                    "select exists(select 1 from forena.organization_member where subject=:subject and organization_id=:org and active and role in ('owner','admin'))"
                )
                .param("subject", actor.subject)
                .param("org", org)
                .query(Boolean::class.java)
                .single()
        val sectionAdmin =
            section != null &&
                jdbc
                    .sql(
                        "select exists(select 1 from forena.section_administrator where subject=:subject and section_id=:section and organization_id=:org and active)"
                    )
                    .param("subject", actor.subject)
                    .param("section", section)
                    .param("org", org)
                    .query(Boolean::class.java)
                    .single()
        if (!club && !sectionAdmin) throw AccessDeniedException("Profile administration required")
        if (
            section != null &&
                !jdbc
                    .sql(
                        "select exists(select 1 from forena.section where id=:section and organization_id=:org)"
                    )
                    .param("section", section)
                    .param("org", org)
                    .query(Boolean::class.java)
                    .single()
        )
            throw AccessDeniedException("Section mismatch")
    }

    @Transactional(readOnly = true)
    fun profile(actor: Actor, org: UUID): AssistantProfile {
        requireOrganization(actor, org)
        return jdbc
            .sql(
                "select name,personality,instructions,revision from forena.assistant_profile where organization_id=:org"
            )
            .param("org", org)
            .query(AssistantProfile::class.java)
            .optional()
            .orElse(AssistantProfile("Föreningsassistenten"))
    }

    @Transactional
    fun save(actor: Actor, org: UUID, profile: AssistantProfile) {
        requireAdmin(actor, org)
        require(
            profile.name.trim().length in 1..100 &&
                profile.personality.length <= 2000 &&
                profile.instructions.length <= 6000
        )
        jdbc
            .sql("select id from forena.organization where id=:org for update")
            .param("org", org)
            .query(UUID::class.java)
            .single()
        requireAdmin(actor, org)
        val old =
            jdbc
                .sql("select revision from forena.assistant_profile where organization_id=:org")
                .param("org", org)
                .query(Long::class.java)
                .optional()
                .orElse(0L)
        check(old == profile.revision)
        jdbc
            .sql(
                "insert into forena.assistant_profile(organization_id,name,personality,instructions,revision) values(:org,:name,:personality,:instructions,:revision) on conflict(organization_id) do update set name=:name,personality=:personality,instructions=:instructions,revision=:revision"
            )
            .param("org", org)
            .param("name", profile.name.trim())
            .param("personality", profile.personality)
            .param("instructions", profile.instructions)
            .param("revision", old + 1)
            .update()
        jdbc
            .sql(
                "insert into forena.assistant_profile_audit(subject,organization_id,revision) values(:subject,:org,:revision)"
            )
            .param("subject", actor.subject)
            .param("org", org)
            .param("revision", old + 1)
            .update()
    }

    @Transactional(readOnly = true)
    fun section(actor: Actor, org: UUID, section: UUID): SectionProfile {
        requireOrganization(actor, org)
        require(
            jdbc
                .sql(
                    "select exists(select 1 from forena.section where id=:section and organization_id=:org)"
                )
                .param("section", section)
                .param("org", org)
                .query(Boolean::class.java)
                .single()
        )
        return jdbc
            .sql(
                "select instructions,revision from forena.assistant_section_profile where section_id=:section"
            )
            .param("section", section)
            .query(SectionProfile::class.java)
            .optional()
            .orElse(SectionProfile())
    }

    @Transactional
    fun saveSection(actor: Actor, org: UUID, section: UUID, profile: SectionProfile) {
        requireAdmin(actor, org, section)
        require(profile.instructions.length <= 6000)
        jdbc
            .sql("select id from forena.section where id=:section for update")
            .param("section", section)
            .query(UUID::class.java)
            .single()
        requireAdmin(actor, org, section)
        val old =
            jdbc
                .sql(
                    "select revision from forena.assistant_section_profile where section_id=:section"
                )
                .param("section", section)
                .query(Long::class.java)
                .optional()
                .orElse(0L)
        check(old == profile.revision)
        jdbc
            .sql(
                "insert into forena.assistant_section_profile(section_id,instructions,revision) values(:section,:instructions,:revision) on conflict(section_id) do update set instructions=:instructions,revision=:revision"
            )
            .param("section", section)
            .param("instructions", profile.instructions)
            .param("revision", old + 1)
            .update()
        jdbc
            .sql(
                "insert into forena.assistant_profile_audit(subject,organization_id,section_id,revision) values(:subject,:org,:section,:revision)"
            )
            .param("subject", actor.subject)
            .param("org", org)
            .param("section", section)
            .param("revision", old + 1)
            .update()
    }

    fun validateMemory(actor: Actor, draft: MemoryDraft) {
        sessions.requireActive(actor)
        require(draft.content.trim().length in 1..2000)
        when (draft.scope) {
            "personal" ->
                require(
                    draft.organizationId == null &&
                        draft.sectionId == null &&
                        draft.teamId == null &&
                        draft.disciplineKey == null
                )
            "organization" -> {
                require(draft.sectionId == null && draft.teamId == null)
                requireAdmin(actor, requireNotNull(draft.organizationId))
            }
            "section" -> {
                require(draft.teamId == null)
                requireAdmin(
                    actor,
                    requireNotNull(draft.organizationId),
                    requireNotNull(draft.sectionId),
                )
            }
            "team" -> {
                val team = requireNotNull(draft.teamId)
                if (!management.canManageMemory(actor, team))
                    throw AccessDeniedException("Team memory permission required")
                val matches =
                    jdbc
                        .sql(
                            "select exists(select 1 from forena.team where id=:team and organization_id=:org and (:noSection or section_id=:section))"
                        )
                        .param("team", team)
                        .param("org", draft.organizationId)
                        .param("noSection", draft.sectionId == null)
                        .param("section", draft.sectionId)
                        .query(Boolean::class.java)
                        .single()
                require(matches)
            }
            else -> throw IllegalArgumentException()
        }
    }

    @Transactional
    fun remember(actor: Actor, draft: MemoryDraft) {
        validateMemory(actor, draft)
        jdbc
            .sql(
                "insert into forena.assistant_memory(id,subject,organization_id,section_id,team_id,discipline_key,content,created_by) values(:id,:subject,:org,:section,:team,:discipline,:content,:actor)"
            )
            .param("id", UUID.randomUUID())
            .param("subject", if (draft.scope == "personal") actor.subject else null)
            .param("org", draft.organizationId)
            .param("section", draft.sectionId)
            .param("team", draft.teamId)
            .param("discipline", draft.disciplineKey)
            .param("content", draft.content.trim())
            .param("actor", actor.subject)
            .update()
    }

    @Transactional(readOnly = true)
    fun memories(
        actor: Actor,
        org: UUID?,
        section: UUID?,
        team: UUID?,
        discipline: String?,
    ): List<AssistantMemory> {
        sessions.requireActive(actor)
        if (org != null) requireOrganization(actor, org)
        return jdbc
            .sql(
                """select * from forena.assistant_memory where subject=:subject or
            (subject is null and organization_id=:org and (section_id is null or section_id=:section)
            and (team_id is null or team_id=:team) and (discipline_key is null or discipline_key=:discipline))
            order by (team_id is not null),(section_id is not null),created_at,id"""
            )
            .param("subject", actor.subject)
            .param("org", org)
            .param("section", section)
            .param("team", team)
            .param("discipline", discipline)
            .query(AssistantMemory::class.java)
            .list()
            .map { requireNotNull(it) }
    }
}
