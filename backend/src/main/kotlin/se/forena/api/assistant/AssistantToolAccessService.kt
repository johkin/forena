package se.forena.api.assistant

import java.util.UUID
import org.springframework.security.access.AccessDeniedException
import org.springframework.stereotype.Service
import se.forena.api.activities.AssistantActivityService
import se.forena.api.activities.AssistantTeamData
import se.forena.api.activities.PersonalActivity

/** Resolves authorized resources and applies the caller's additional workspace boundary. */
@Service
class AssistantToolAccessService(private val activities: AssistantActivityService) {
    fun team(scope: AssistantToolScope, teamId: UUID): AssistantTeamData {
        scope.requireTeam(teamId)
        return activities.team(scope.actor, teamId).also { scope.requireOrganization(it.organizationId) }
    }

    fun teamInOrganization(
        scope: AssistantToolScope,
        organizationId: UUID,
        teamId: UUID?,
    ): AssistantTeamData? {
        scope.requireOrganization(organizationId)
        return (teamId ?: scope.teamId)?.let { id ->
            team(scope, id).also {
                if (it.organizationId != organizationId)
                    throw AccessDeniedException("Team outside organization")
            }
        }
    }

    fun activity(
        scope: AssistantToolScope,
        activityId: UUID,
        team: AssistantTeamData? = null,
    ): PersonalActivity = activities.activity(scope.actor, activityId).also {
        scope.requireResource(it.organization.id, it.team.id)
        if (team != null && (it.organization.id != team.organizationId || it.team.id != team.teamId))
            throw AccessDeniedException("Activity outside selected team")
    }
}
