package se.forena.api.activities

import java.time.LocalDate
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
class TeamRosterService(
    private val sessions: SessionService,
    private val teamAccess: TeamAccessService,
    private val clock: DatabaseClockService,
    private val management: ManagementRepository,
    private val roster: RosterRepository,
    private val groups: AudienceGroupRepository,
    private val groupMembers: AudienceMemberRepository,
    private val directory: RosterDirectory
) {
    @Transactional(readOnly = true)
    fun access(actor: Actor, teamId: UUID): Boolean {
        sessions.requireActive(actor)
        val team = management.team(teamId) ?: return false
        return allowed(actor, team)
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    @PreAuthorize("@teamAccess.canAdministerRoster(#actor, #teamId)")
    fun snapshot(actor: Actor, teamId: UUID): TeamRosterSnapshot {
        val team = authorize(actor, teamId)
        val members = roster.members(teamId, today(team)).groupBy { it.id }
        val ids = members.keys
        val teamGroups = groups.findByTeamId(teamId)
        val groupsById = teamGroups.associateBy { it.id }
        val groupIds = teamGroups.map { it.id }
        val assignments = if (groupIds.isEmpty()) emptyList() else groupMembers.findByGroupIdInAndActiveTrue(groupIds)
        val assignmentsByPerson = assignments.groupBy { it.personId }
        val assignmentsByGroup = assignments.groupBy { it.groupId }
        val accounts = directory.accounts(team.organizationId, ids).associateBy { it.personId }
        val guardians = directory.guardians(team.organizationId, ids)
        val guardiansByPerson = guardians.groupBy { it.personId }
        val childrenBySubject = guardians.groupBy { it.subject }
        val people = members.map { (id, rows) ->
            val responsibilities = assignmentsByPerson[id].orEmpty().mapNotNull { assignment ->
                groupsById[assignment.groupId]?.takeIf { it.kind == "responsibility" }?.name
            }.distinct().sorted()
            val subject = accounts[id]?.subject
            RosterMember(id, rows.first().displayName, rows.map { it.role }.distinct(),
                responsibilities.joinToString(" · "), subject != null,
                guardiansByPerson[id].orEmpty().distinctBy { it.subject }.map { RosterContact(it.name, it.phone) },
                childrenBySubject[subject].orEmpty().map { it.personId }.distinct())
        }
        return TeamRosterSnapshot(RosterTeam(team.id, team.name, team.organizationName), people,
            teamGroups.filter { it.kind == "group" }.sortedBy { it.name }.map { group ->
                RosterSubgroup(group.id, group.name, group.revision,
                    assignmentsByGroup[group.id].orEmpty().filter { it.personId in ids }.map { it.personId }.distinct())
            })
    }

    @Transactional
    @PreAuthorize("@teamAccess.canAdministerRoster(#actor, #teamId)")
    fun rename(actor: Actor, teamId: UUID, personId: UUID, command: RosterNameCommand) {
        val team = lock(actor, teamId)
        if (roster.members(teamId, today(team)).none { it.id == personId }) throw NoSuchElementException()
        directory.rename(team.organizationId, personId, command.name)
        roster.audit(team.organizationId, teamId, actor.subject, "member.updated", personId)
    }

    @Transactional
    @PreAuthorize("@teamAccess.canAdministerRoster(#actor, #teamId)")
    fun createGroup(actor: Actor, teamId: UUID, command: RosterGroupCommand): RosterSubgroup {
        val team = lock(actor, teamId)
        validate(team, command)
        val id = UUID.randomUUID()
        check(roster.createGroup(id, team.organizationId, teamId, command.name.trim()) == 1)
        command.personIds.distinct().forEach { roster.addMember(id, team.organizationId, it) }
        roster.audit(team.organizationId, teamId, actor.subject, "group.created", id)
        return RosterSubgroup(id, command.name.trim(), 0, command.personIds.distinct())
    }

    @Transactional
    @PreAuthorize("@teamAccess.canAdministerRoster(#actor, #teamId)")
    fun updateGroup(actor: Actor, teamId: UUID, id: UUID, command: RosterGroupCommand) {
        val team = lock(actor, teamId)
        validate(team, command)
        val revision = requireNotNull(command.revision)
        // Claim the version before replacing selections; any failure rolls back the whole command.
        check(roster.updateGroup(id, teamId, command.name.trim(), revision) == 1)
        roster.clearGroup(id)
        command.personIds.distinct().forEach { roster.addMember(id, team.organizationId, it) }
        roster.audit(team.organizationId, teamId, actor.subject, "group.updated", id)
    }

    @Transactional
    @PreAuthorize("@teamAccess.canAdministerRoster(#actor, #teamId)")
    fun deleteGroup(actor: Actor, teamId: UUID, id: UUID, revision: Long) {
        val team = lock(actor, teamId)
        val group = groups.findByTeamId(teamId).singleOrNull { it.id == id && it.kind == "group" }
            ?: throw NoSuchElementException()
        check(group.revision == revision)
        roster.clearGroup(id)
        check(roster.deleteGroup(id, teamId, revision) == 1)
        roster.audit(team.organizationId, teamId, actor.subject, "group.deleted", id)
    }

    private fun validate(team: ManagementTeamRow, command: RosterGroupCommand) {
        require(command.name.trim().length in 1..80)
        require(command.personIds.size <= 20000)
        val people = roster.members(team.id, today(team)).map { it.id }.toSet()
        require(command.personIds.all { it in people })
    }

    private fun lock(actor: Actor, teamId: UUID): ManagementTeamRow {
        authorize(actor, teamId)
        check(management.lockTeam(teamId) != null)
        return authorize(actor, teamId)
    }

    private fun authorize(actor: Actor, teamId: UUID): ManagementTeamRow {
        sessions.requireActive(actor)
        val team = management.team(teamId) ?: throw NoSuchElementException()
        if (!allowed(actor, team)) throw AccessDeniedException("Roster permission required")
        return team
    }

    private fun allowed(actor: Actor, team: ManagementTeamRow) =
        teamAccess.allowed(actor, team, TeamPermission.MANAGE_ROSTER)

    private fun today(team: ManagementTeamRow): LocalDate = clock.now().atZone(ZoneId.of(team.timeZone)).toLocalDate()
}
