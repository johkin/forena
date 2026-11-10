package se.forena.api.activities

import java.time.ZoneId
import java.util.UUID
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import se.forena.api.activities.internal.ManagedActivityRepository
import se.forena.api.activities.internal.ManagementRepository
import se.forena.api.activities.internal.ManagementTeamRow
import se.forena.api.identity.Actor
import se.forena.api.identity.DatabaseClockService
import se.forena.api.identity.SessionService

enum class TeamPermission(val key: String) {
    MANAGE_ACTIVITIES("activity.manage"),
    MANAGE_INVITATIONS("invitation.manage"),
    MANAGE_ATTENDANCE("attendance.manage"),
    MANAGE_ROSTER("roster.manage"),
    MANAGE_ASSISTANT_MEMORY("assistant.memory.manage");

    companion object {
        val keys: List<String> = entries.map { it.key }
    }
}

/** Object-level authorization shared by method security, command admission and authorized reads. */
@Component("teamAccess")
@Transactional(readOnly = true)
class TeamAccessService(
    private val repository: ManagementRepository,
    private val sessions: SessionService,
    private val clock: DatabaseClockService,
    private val activities: ManagedActivityRepository,
) {
    fun allowed(actor: Actor, teamId: UUID, permission: TeamPermission): Boolean {
        sessions.requireActive(actor)
        val team = repository.team(teamId) ?: return false
        return allowedVerified(actor, team, permission)
    }

    fun allowed(actor: Actor, team: ManagementTeamRow, permission: TeamPermission): Boolean {
        sessions.requireActive(actor)
        return allowedVerified(actor, team, permission)
    }

    private fun allowedVerified(actor: Actor, team: ManagementTeamRow, permission: TeamPermission): Boolean {
        val today = clock.now().atZone(ZoneId.of(team.timeZone)).toLocalDate()
        return repository.allowed(
            actor.subject,
            team.organizationId,
            team.id,
            permission.key,
            today,
        )
    }

    fun canManageActivities(actor: Actor, teamId: UUID): Boolean =
        allowed(actor, teamId, TeamPermission.MANAGE_ACTIVITIES)

    fun canCreateActivities(actor: Actor, teamId: UUID?): Boolean {
        sessions.requireActive(actor)
        val team = repository.team(requireNotNull(teamId)) ?: return false
        return allowedVerified(actor, team, TeamPermission.MANAGE_ACTIVITIES)
    }

    fun canManageInvitations(actor: Actor, teamId: UUID): Boolean =
        allowed(actor, teamId, TeamPermission.MANAGE_INVITATIONS)

    fun canManageAttendance(actor: Actor, teamId: UUID): Boolean =
        allowed(actor, teamId, TeamPermission.MANAGE_ATTENDANCE)

    fun canManageRoster(actor: Actor, teamId: UUID): Boolean =
        allowed(actor, teamId, TeamPermission.MANAGE_ROSTER)

    fun canManageMemory(actor: Actor, teamId: UUID): Boolean =
        allowed(actor, teamId, TeamPermission.MANAGE_ASSISTANT_MEMORY)

    // These existing APIs distinguish a missing resource (404) from a denied operation (403).
    fun canOpenActivityEditor(actor: Actor, teamId: UUID): Boolean =
        allowedExistingTeam(actor, teamId, TeamPermission.MANAGE_ACTIVITIES)

    fun canAdministerRoster(actor: Actor, teamId: UUID): Boolean =
        allowedExistingTeam(actor, teamId, TeamPermission.MANAGE_ROSTER)

    private fun allowedExistingTeam(
        actor: Actor,
        teamId: UUID,
        permission: TeamPermission,
    ): Boolean {
        sessions.requireActive(actor)
        val team = repository.team(teamId) ?: throw NoSuchElementException()
        return allowedVerified(actor, team, permission)
    }

    fun canManageActivity(actor: Actor, activityId: UUID): Boolean =
        allowedActivity(actor, activityId, TeamPermission.MANAGE_ACTIVITIES)

    fun canReportAttendance(actor: Actor, activityId: UUID): Boolean =
        allowedActivity(actor, activityId, TeamPermission.MANAGE_ATTENDANCE)

    private fun allowedActivity(
        actor: Actor,
        activityId: UUID,
        permission: TeamPermission,
    ): Boolean {
        sessions.requireActive(actor)
        val activity = activities.findById(activityId).orElseThrow { NoSuchElementException() }
        if (activity.deletedAt != null) throw NoSuchElementException()
        val team = repository.team(activity.teamId) ?: return false
        return allowedVerified(actor, team, permission)
    }

    /** Fresh permissions for one domain operation; never retained in an Actor or across tool calls. */
    fun permissions(actor: Actor, teamId: UUID): Set<TeamPermission> {
        sessions.requireActive(actor)
        val team = repository.team(teamId) ?: return emptySet()
        return permissionsVerified(actor, team)
    }

    fun permissions(actor: Actor, team: ManagementTeamRow): Set<TeamPermission> {
        sessions.requireActive(actor)
        return permissionsVerified(actor, team)
    }

    private fun permissionsVerified(actor: Actor, team: ManagementTeamRow): Set<TeamPermission> {
        val today = clock.now().atZone(ZoneId.of(team.timeZone)).toLocalDate()
        val granted = repository.permissions(actor.subject, team.organizationId, team.id, TeamPermission.keys, today).toSet()
        return TeamPermission.entries.filterTo(linkedSetOf()) { it.key in granted }
    }

    fun hasAssistantManagementAccess(actor: Actor, teamId: UUID): Boolean =
        permissions(actor, teamId).isNotEmpty()
}
