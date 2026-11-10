package se.forena.api.assistant

import java.util.UUID
import org.springframework.security.access.AccessDeniedException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import se.forena.api.activities.ActivityManagementService
import se.forena.api.administration.AdministrationAccessService
import se.forena.api.assistant.internal.AssistantProfileRepository
import se.forena.api.identity.Actor
import se.forena.api.identity.SessionService

@Service
class AssistantProfileService(
    private val repository: AssistantProfileRepository,
    private val sessions: SessionService,
    private val administration: AdministrationAccessService,
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
        val allowed = if (section == null)
            administration.isClubAdministrator(actor.subject, org)
        else administration.canAdministerSectionBusiness(actor.subject, org, section)
        if (!allowed) throw AccessDeniedException("Profile administration required")
    }

    @Transactional(readOnly = true)
    fun profile(actor: Actor, org: UUID): AssistantProfile {
        requireOrganization(actor, org)
        return repository.findProfile(org).orElseGet {
            AssistantProfile(identities.organizations(actor).single { it.id == org }.name)
        }
    }

    @Transactional
    fun save(actor: Actor, org: UUID, profile: AssistantProfile) {
        requireAdmin(actor, org)
        require(
            profile.name.trim().length in 1..100 &&
                profile.personality.length <= 2000 &&
                profile.instructions.length <= 6000
        )
        repository.lockOrganization(org)
        val old = repository.profileRevision(org).orElse(0L)
        check(old == profile.revision)
        repository.saveProfile(
            org,
            profile.name.trim(),
            profile.personality,
            profile.instructions,
            old + 1,
        )
        repository.auditProfile(actor.subject, org, old + 1)
    }

    @Transactional(readOnly = true)
    fun section(actor: Actor, org: UUID, section: UUID): SectionProfile {
        requireOrganization(actor, org)
        require(administration.sectionBelongsToOrganization(org, section))
        return repository.findSectionProfile(section).orElse(SectionProfile())
    }

    @Transactional
    fun saveSection(actor: Actor, org: UUID, section: UUID, profile: SectionProfile) {
        requireAdmin(actor, org, section)
        require(profile.instructions.length <= 6000)
        repository.lockSection(section)
        val old = repository.sectionRevision(section).orElse(0L)
        check(old == profile.revision)
        repository.saveSectionProfile(section, profile.instructions, old + 1)
        repository.auditSectionProfile(actor.subject, org, section, old + 1)
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
                    repository.teamMatchesScope(
                        team,
                        draft.organizationId,
                        draft.sectionId == null,
                        draft.sectionId,
                    )
                require(matches)
            }
            else -> throw IllegalArgumentException()
        }
    }

    @Transactional
    fun remember(actor: Actor, draft: MemoryDraft) {
        validateMemory(actor, draft)
        repository.insertMemory(
            UUID.randomUUID(),
            if (draft.scope == "personal") actor.subject else null,
            draft.organizationId,
            draft.sectionId,
            draft.teamId,
            draft.disciplineKey,
            draft.content.trim(),
            actor.subject,
        )
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
        return repository.findApplicableMemories(actor.subject, org, section, team, discipline)
    }
}
