package se.forena.api.activities

import java.time.ZoneId
import java.util.UUID
import org.springframework.security.access.AccessDeniedException
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional
import se.forena.api.activities.internal.*
import se.forena.api.identity.Actor
import se.forena.api.identity.DatabaseClockService
import se.forena.api.identity.RosterDirectory
import se.forena.api.identity.SessionService

@Service
class AttendanceService(
    private val sessions: SessionService,
    private val teamAccess: TeamAccessService,
    private val clock: DatabaseClockService,
    private val activities: ManagedActivityRepository,
    private val management: ManagementRepository,
    private val attendance: AttendanceRepository,
    private val groups: AudienceGroupRepository,
    private val groupMembers: AudienceMemberRepository,
    private val directory: RosterDirectory
) {
    @Transactional(readOnly = true)
    fun teams(actor: Actor): List<ManagementTeamRow> {
        sessions.requireActive(actor)
        return management.teams(actor.subject).filter { allowed(actor, it) }
    }

    @Transactional(readOnly = true)
    fun access(actor: Actor, id: UUID): Boolean {
        sessions.requireActive(actor)
        val activity = activities.findById(id).orElse(null)?.takeIf { it.deletedAt == null } ?: return false
        val team = management.team(activity.teamId) ?: return false
        return allowed(actor, team)
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    @PreAuthorize("@teamAccess.canReportAttendance(#actor, #id)")
    fun snapshot(actor: Actor, id: UUID): AttendanceSnapshot {
        val (activity, team) = authorize(actor, id)
        val report = attendance.report(id)
        val roster = roster(activity, team, report != null)
        val teamGroups = groups.findByTeamId(team.id).filter { it.kind == "group" }
        val members = if (teamGroups.isEmpty()) emptyList() else groupMembers.findByGroupIdInAndActiveTrue(teamGroups.map { it.id })
        val rosterIds = roster.map { it.personId }.toSet()
        val changes = attendance.changes(id).groupBy { it.historyId }
        return AttendanceSnapshot(report?.revision ?: 0, report?.reportedAt, activity.status,
            activity.status != "cancelled" && !clock.now().isBefore(activity.startsAt), roster,
            candidates(team).filter { it.personId !in rosterIds },
            teamGroups.map { group -> AttendanceGroup(group.id, group.name,
                members.filter { it.groupId == group.id && it.personId in rosterIds }.map { it.personId }.distinct()) },
            attendance.history(id).map { history -> AttendanceHistory(history.revision, history.actorName, history.changedAt,
                changes[history.id].orEmpty().map { AttendanceChange(it.personId, it.displayName, it.previousPresent, it.present) }) })
    }

    @Transactional
    @PreAuthorize("@teamAccess.canReportAttendance(#actor, #id)")
    fun save(actor: Actor, id: UUID, command: AttendanceCommand) {
        val (activity, team) = lock(actor, id)
        check(activity.status != "cancelled" && !clock.now().isBefore(activity.startsAt))
        val report = attendance.report(id)
        check(command.revision == (report?.revision ?: 0L))
        require(command.rosterIds.size <= 20_000 && command.personIds.size <= 20_000)
        val assessed = command.rosterIds.toSet()
        val present = command.personIds.toSet()
        require(present.all { it in assessed })
        require(present.isNotEmpty() || command.confirmEmpty)
        val previous = roster(activity, team, report != null)
        // A correction retains the assessed roster. Only explicit, validated additions widen it.
        check(previous.all { it.personId in assessed })
        val allowed = (previous + candidates(team)).associateBy { it.personId }
        require(assessed.all { it in allowed })
        val now = clock.now()
        val revision = (report?.revision ?: 0) + 1
        attendance.writeReport(id, activity.organizationId, revision, now, actor.subject)
        val historyId = UUID.randomUUID()
        attendance.writeHistory(historyId, id, activity.organizationId, revision, actor.subject,
            directory.actorName(activity.organizationId, actor.subject), now)
        val previousById = previous.associateBy { it.personId }
        assessed.forEach { personId ->
            val person = allowed.getValue(personId)
            val isPresent = personId in present
            attendance.writePerson(id, activity.organizationId, personId, person.role, isPresent)
            val wasPresent = previousById[personId]?.present
            if (wasPresent != isPresent) attendance.writeChange(historyId, personId, person.displayName, wasPresent, isPresent)
        }
    }

    /** A channel proposal changes only explicitly assessed people; unknown others stay unknown. */
    @Transactional
    @PreAuthorize("@teamAccess.canReportAttendance(#actor, #id)")
    fun patch(actor: Actor, id: UUID, revision: Long, changes: Map<UUID,Boolean>) {
        val (activity,team) = lock(actor,id)
        check(activity.status!="cancelled" && !clock.now().isBefore(activity.startsAt))
        val report = attendance.report(id)
        check(revision==(report?.revision ?: 0L))
        require(changes.isNotEmpty() && changes.size<=20000)
        val before = roster(activity,team,report!=null).associateBy { it.personId }
        require(changes.keys.all { it in before })
        val now = clock.now(); val next = revision+1; val history = UUID.randomUUID()
        attendance.writeReport(id,activity.organizationId,next,now,actor.subject)
        attendance.writeHistory(history,id,activity.organizationId,next,actor.subject,directory.actorName(activity.organizationId,actor.subject),now)
        changes.forEach { (personId,present) ->
            val previous = before.getValue(personId)
            attendance.writePerson(id,activity.organizationId,personId,previous.role,present)
            if (previous.present!=present) attendance.writeChange(history,personId,previous.displayName,previous.present,present)
        }
    }

    private fun roster(activity: ManagedActivityEntity, team: ManagementTeamRow, reported: Boolean): List<AttendancePerson> =
        attendance.initialPeople(activity.activityId, team.id,
            activity.startsAt.atZone(ZoneId.of(team.timeZone)).toLocalDate()).let { initial ->
            if (!reported) initial else {
                val recorded = attendance.people(activity.activityId)
                val recordedIds = recorded.map { it.personId }.toSet()
                recorded + initial.filter { it.personId !in recordedIds }
            }
        }

    private fun candidates(team: ManagementTeamRow): List<AttendancePerson> =
        team.sectionId?.let { attendance.candidates(team.organizationId, it,
            clock.now().atZone(ZoneId.of(team.timeZone)).toLocalDate()) }.orEmpty()

    private fun lock(actor: Actor, id: UUID): Pair<ManagedActivityEntity, ManagementTeamRow> {
        val (_, admittedTeam) = authorize(actor, id)
        val activity = activities.findLockedByActivityId(id) ?: throw NoSuchElementException()
        if (activity.deletedAt != null) throw NoSuchElementException()
        check(
            activity.teamId == admittedTeam.id &&
                activity.organizationId == admittedTeam.organizationId
        )
        val team = management.team(activity.teamId) ?: throw NoSuchElementException()
        return activity to team
    }

    private fun authorize(actor: Actor, id: UUID): Pair<ManagedActivityEntity, ManagementTeamRow> {
        sessions.requireActive(actor)
        val activity = activities.findById(id).orElseThrow { NoSuchElementException() }
        if (activity.deletedAt != null) throw NoSuchElementException()
        val team = management.team(activity.teamId) ?: throw NoSuchElementException()
        if (!allowed(actor, team)) throw AccessDeniedException("Attendance permission required")
        return activity to team
    }

    private fun allowed(actor: Actor, team: ManagementTeamRow) =
        teamAccess.allowed(actor, team, TeamPermission.MANAGE_ATTENDANCE)
}
