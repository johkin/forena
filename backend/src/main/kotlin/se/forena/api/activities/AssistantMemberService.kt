package se.forena.api.activities

import java.util.UUID
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import se.forena.api.activities.internal.AssistantMemberRepository
import se.forena.api.administration.AdministrationAccessService
import se.forena.api.identity.*

@Service
class AssistantMemberService(
    private val repository: AssistantMemberRepository,
    private val sessions: SessionService,
    private val administration: AdministrationAccessService,
    private val management: ActivityManagementService,
) {
    @Transactional(readOnly = true)
    fun read(actor: Actor, organization: UUID, team: UUID?, section: UUID?): AssistantMembers? {
        sessions.requireActive(actor)
        val clubAdmin = administration.isClubAdministrator(actor.subject, organization)
        val sectionAdmin =
            section != null &&
                administration.isSectionAdministrator(actor.subject, organization, section)
        if (
            !clubAdmin &&
                !sectionAdmin &&
                (team == null || !management.canManageRoster(actor, team))
        )
            return null
        // No contacts, account addresses or personal identifiers beyond the authorized roster.
        val rows =
            repository.findAssignments(organization, team, team == null, section, section == null)
        val total =
            repository.countPeople(organization, team, team == null, section, section == null)
        return AssistantMembers(total, rows.take(200), rows.size > 200)
    }
}
