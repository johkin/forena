package se.forena.api.assistant

import java.util.UUID
import org.springframework.ai.chat.model.ToolContext
import org.springframework.ai.tool.annotation.Tool
import org.springframework.ai.tool.annotation.ToolParam
import org.springframework.aot.hint.annotation.RegisterReflectionForBinding
import org.springframework.security.access.AccessDeniedException
import org.springframework.stereotype.Service
import se.forena.api.activities.AssistantActivityService
import se.forena.api.activities.PersonalActivity
import se.forena.api.activities.PersonalOverviewService
import se.forena.api.activities.TeamAccessService

/** Shared read tools for the assistant and MCP. Identity is supplied only by the caller's runtime. */
@Service
@RegisterReflectionForBinding(
    SharedActivities::class, SharedActivity::class, SharedTeams::class,
    SharedTeam::class, SharedTeamOverview::class, SharedNames::class,
)
class SharedActivityTools(
    private val overview: PersonalOverviewService,
    private val activities: AssistantActivityService,
    private val access: TeamAccessService,
    private val resources: AssistantToolAccessService,
) {
    @Tool(
        name = "list_my_activities",
        description = "Läs dina och familjens kommande aktiviteter. Inga kontaktuppgifter eller svarskommentarer.",
    )
    fun listMyActivities(context: ToolContext): SharedActivities {
        val scope = AssistantToolScope.from(context)
        val visible = overview.overview(scope.actor).activities.filter {
            scope.includes(it.organization.id, it.team.id)
        }
        return SharedActivities(visible.take(ACTIVITY_LIMIT).map { it.minimized() }, ACTIVITY_LIMIT, visible.size > ACTIVITY_LIMIT)
    }

    @Tool(
        name = "list_teams",
        description = "Lista lag du får läsa eller administrera. Fortsätt med nextOffset tills det är null. Inga medlemsuppgifter.",
    )
    fun listTeams(
        @ToolParam(description = "Sidans startposition, 0 om den utelämnas.", required = false) offset: Int?,
        context: ToolContext,
    ): SharedTeams {
        val scope = AssistantToolScope.from(context)
        val start = offset ?: 0
        require(start in 0..100_000)
        val personal = overview.overview(scope.actor).teams.map { SharedTeam(it.id, it.organization_id, it.name) }
        val managed = activities.catalogTeams(scope.actor).map { SharedTeam(it.id, it.organizationId, it.name) }
        val visible = (personal + managed)
            .distinctBy { it.id }
            .filter { scope.includes(it.organizationId, it.id) }
            .sortedBy { it.id.toString() }
        val more = visible.size > start + TEAM_LIMIT
        return SharedTeams(visible.drop(start).take(TEAM_LIMIT), if (more) start + TEAM_LIMIT else null, TEAM_LIMIT, more)
    }

    @Tool(
        name = "get_team_overview",
        description = "Läs ett tillgängligt lags tidszon och högst fem kommande aktiviteter. Inga personuppgifter, kommentarer eller minnen.",
    )
    fun getTeamOverview(teamId: UUID, context: ToolContext): SharedTeamOverview {
        val scope = AssistantToolScope.from(context)
        val team = resources.team(scope, teamId)
        val now = overview.overview(scope.actor).reference_time
        val visible = activities.catalogActivities(scope.actor).filter {
            it.team.id == team.teamId && it.organization.id == team.organizationId &&
                it.status == "scheduled" && it.ends_at > now
        }
        return SharedTeamOverview(
            SharedTeam(team.teamId, team.organizationId, team.teamName),
            team.organizationName,
            team.timeZone,
            visible.take(OVERVIEW_LIMIT).map { it.minimized() },
            OVERVIEW_LIMIT,
            visible.size > OVERVIEW_LIMIT,
        )
    }

    @Tool(
        name = "get_team_member_names",
        description = "Läs aktiva lagmedlemmars visningsnamn. Kräver aktuell roster.manage för laget; familjeåtkomst räcker inte.",
    )
    fun getTeamMemberNames(teamId: UUID, context: ToolContext): SharedNames {
        val scope = AssistantToolScope.from(context)
        val team = resources.team(scope, teamId)
        if (!access.canManageRoster(scope.actor, team.teamId)) throw AccessDeniedException("Roster permission required")
        val people = team.roster.distinctBy { it.id }.sortedBy { it.displayName }
        return SharedNames(people.take(NAME_LIMIT).map { it.displayName }, NAME_LIMIT, people.size > NAME_LIMIT)
    }

    @Tool(
        name = "get_accepted_participant_names",
        description = "Läs visningsnamn på dem som tackat ja till en tillgänglig aktivitet i laget. Kräver aktuell invitation.manage. Anmälan är inte närvaro.",
    )
    fun getAcceptedParticipantNames(teamId: UUID, activityId: UUID, context: ToolContext): SharedNames {
        val scope = AssistantToolScope.from(context)
        val team = resources.team(scope, teamId)
        if (!access.canManageInvitations(scope.actor, team.teamId)) throw AccessDeniedException("Invitation permission required")
        resources.activity(scope, activityId, team)
        val accepted = activities.invitations(scope.actor, activityId)
            .filter { it.response == "accepted" }
            .distinctBy { it.personId }
            .sortedBy { it.name }
        return SharedNames(accepted.take(NAME_LIMIT).map { it.name }, NAME_LIMIT, accepted.size > NAME_LIMIT)
    }

    private fun PersonalActivity.minimized() = SharedActivity(
        id, title, starts_at, ends_at, organization.name, team.name, location,
    )

    companion object {
        private const val ACTIVITY_LIMIT = 50
        private const val TEAM_LIMIT = 25
        private const val OVERVIEW_LIMIT = 5
        private const val NAME_LIMIT = 500
    }
}
