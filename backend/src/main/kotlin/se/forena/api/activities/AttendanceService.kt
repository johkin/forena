package se.forena.api.activities

import java.time.Instant
import java.time.ZoneId
import java.util.UUID
import org.springframework.security.access.AccessDeniedException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import se.forena.api.activities.internal.AudienceGroupRepository
import se.forena.api.activities.internal.AudienceMemberRepository
import se.forena.api.activities.internal.AttendanceRepository
import se.forena.api.activities.internal.ManagedActivityEntity
import se.forena.api.activities.internal.ManagedActivityRepository
import se.forena.api.identity.Actor
import se.forena.api.identity.DatabaseClockService
import se.forena.api.identity.SessionService

/** Adapter for the existing attendance-reporting workflow; invitation answers are never attendance. */
@Service
class AttendanceService(
    private val sessions: SessionService,
    private val clock: DatabaseClockService,
    private val management: ActivityManagementService,
    private val activities: ManagedActivityRepository,
    private val attendance: AttendanceRepository,
    private val groups: AudienceGroupRepository,
    private val groupMembers: AudienceMemberRepository,
) {
    @Transactional(readOnly = true)
    fun read(actor: Actor, id: UUID): AttendanceSnapshot {
        val activity = activities.findById(id).orElseThrow { NoSuchElementException() }
        authorize(actor, activity)
        return snapshot(activity)
    }

    @Transactional
    fun report(actor: Actor, id: UUID, command: AttendanceCommand): AttendanceSnapshot {
        val initial = activities.findById(id).orElseThrow { NoSuchElementException() }
        authorize(actor, initial)
        val activity = activities.findLockedByActivityId(id) ?: throw NoSuchElementException()
        authorize(actor, activity)
        check(activity.status == "scheduled" && activity.startsAt <= clock.now())
        val eligible = snapshot(activity).roster.map { it.personId }.toSet()
        val present = command.personIds.distinct()
        require(present.size <= 1000 && present.all { it in eligible })
        attendance.report(id, activity.organizationId, actor.subject, clock.now())
        attendance.clear(id)
        present.forEach { attendance.present(id, activity.organizationId, it) }
        return snapshot(activity)
    }

    private fun authorize(actor: Actor, activity: ManagedActivityEntity) {
        sessions.requireActive(actor)
        if (activity.deletedAt != null) throw NoSuchElementException()
        if (!management.canManageAttendance(actor, activity.teamId)) throw AccessDeniedException("Attendance permission required")
    }

    private fun snapshot(activity: ManagedActivityEntity): AttendanceSnapshot {
        val zone = attendance.timeZone(activity.organizationId)
        val roster = attendance.roster(activity.activityId, activity.teamId, activity.organizationId, activity.startsAt.atZone(ZoneId.of(zone)).toLocalDate())
        val eligible = roster.map { it.personId }.toSet()
        val teamGroups = groups.findByTeamId(activity.teamId).filter { it.kind == "group" }
        val members = if (teamGroups.isEmpty()) emptyList() else groupMembers.findByGroupIdInAndActiveTrue(teamGroups.map { it.id })
        val shortcuts = teamGroups.map { group -> AttendanceGroup(group.id, group.name,
            members.filter { it.groupId == group.id && it.personId in eligible }.map { it.personId }) }
        return AttendanceSnapshot(activity.startsAt <= clock.now(), attendance.reportedAt(activity.activityId), roster, shortcuts)
    }
}
