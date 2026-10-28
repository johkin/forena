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
    MANAGE_ASSISTANT_MEMORY("assistant.memory.manage"),
}

/** Object-level authorization, shared by method security and checks after a lock wait. */
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
        return allowed(actor, team, permission)
    }

    fun allowed(actor: Actor, team: ManagementTeamRow, permission: TeamPermission): Boolean {
        sessions.requireActive(actor)
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
        return allowed(actor, requireNotNull(teamId), TeamPermission.MANAGE_ACTIVITIES)
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
        return allowed(actor, team, permission)
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
        return allowed(actor, activity.teamId, permission)
    }

    fun hasAssistantManagementAccess(actor: Actor, teamId: UUID): Boolean {
        sessions.requireActive(actor)
        val team = repository.team(teamId) ?: return false
        return TeamPermission.entries.any { allowed(actor, team, it) }
    }
}
