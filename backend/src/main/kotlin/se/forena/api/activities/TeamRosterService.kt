package se.forena.api.activities

import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException
import se.forena.api.identity.BrowserSessionSettings
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
    private val directory: RosterDirectory,
    private val registration: RosterRegistrationRepository,
    private val settings: BrowserSessionSettings
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
        val loginStatuses = registration.statuses(teamId).associateBy { it.personId }
        val people = members.map { (id, rows) ->
            val responsibilities = assignmentsByPerson[id].orEmpty().mapNotNull { assignment ->
                groupsById[assignment.groupId]?.takeIf { it.kind == "responsibility" }?.name
            }.distinct().sorted()
            val subject = accounts[id]?.subject
            RosterMember(id, rows.first().displayName, rows.map { it.role }.distinct(),
                responsibilities.joinToString(" · "), subject != null,
                guardiansByPerson[id].orEmpty().distinctBy { it.subject }.map { RosterContact(it.name, it.phone) },
                childrenBySubject[subject].orEmpty().map { it.personId }.distinct(),
                accounts[id]?.email ?: loginStatuses[id]?.email,
                if (subject != null) "accepted" else loginStatuses[id]?.status)
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

    @Transactional(readOnly = true)
    @PreAuthorize("@teamAccess.canAdministerRoster(#actor, #teamId)")
    fun candidates(actor: Actor, teamId: UUID, query: String): List<RosterCandidate> {
        val team = authorize(actor, teamId)
        require(query.trim().length in 2..160)
        return registration.candidates(team.organizationId, query.trim())
    }

    @Transactional
    @PreAuthorize("@teamAccess.canAdministerRoster(#actor, #teamId)")
    fun createMember(actor: Actor, teamId: UUID, command: RosterCreateCommand): RosterCreated {
        val team = lock(actor, teamId)
        registration.registered(command.requestId, teamId, actor.subject)?.let { return RosterCreated(it) }
        require(command.role in setOf("participant", "leader"))
        val today = today(team)
        val start = command.startsOn ?: today
        require(start >= today)
        require(command.birthDate == null || command.birthDate <= today)
        val email = command.email.trim().takeIf { it.isNotEmpty() }?.let(directory::normalizeEmail)
        val person = if (command.personId != null) {
            registration.lockPerson(team.organizationId, command.personId) ?: throw NoSuchElementException()
        } else {
            require(command.name.trim().length in 2..160)
            val matches = registration.candidates(team.organizationId, command.name.trim()) +
                if (email != null) registration.candidates(team.organizationId, email) else emptyList()
            check(matches.isEmpty() || command.duplicatesConfirmed)
            directory.create(team.organizationId, command.name, command.birthDate)
        }
        check(!registration.overlaps(teamId, person, command.role, start))
        check(registration.add(team.organizationId, teamId, person, command.role, start) == 1)
        check(registration.record(command.requestId, teamId, actor.subject, person) == 1)
        roster.audit(team.organizationId, teamId, actor.subject, "member.created", person)
        if (email != null && directory.accounts(team.organizationId, listOf(person)).isEmpty()) {
            sendInvitation(actor, team, person, email)
        }
        return RosterCreated(person)
    }

    @Transactional
    @PreAuthorize("@teamAccess.canAdministerRoster(#actor, #teamId)")
    fun inviteMember(actor: Actor, teamId: UUID, person: UUID, command: RosterEmailCommand) {
        val team = lock(actor, teamId)
        val email = directory.normalizeEmail(command.email)
        check(registration.lockPerson(team.organizationId, person) != null)
        // Future memberships may be invited now, but confer access only from their start date.
        check(registration.overlaps(teamId, person, "participant", today(team)) ||
            registration.overlaps(teamId, person, "leader", today(team)))
        check(directory.accounts(team.organizationId, listOf(person)).isEmpty())
        sendInvitation(actor, team, person, email)
    }

    private fun sendInvitation(actor: Actor, team: ManagementTeamRow, person: UUID, email: String) {
        val now = clock.now()
        val last = registration.lastSent(person)
        if (last != null && last.plusSeconds(60) > now) {
            throw ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS)
        }
        val code = UUID.randomUUID().toString() + UUID.randomUUID().toString()
        val expires = now.plusSeconds(7 * 24 * 60 * 60)
        val mail = directory.invite(email, settings.origin + "/join-team?code=" + code, expires)
        registration.revoke(person)
        registration.invite(UUID.randomUUID(), team.organizationId, team.id, person, email,
            settings.fingerprint(code), actor.subject, mail, expires)
        roster.audit(team.organizationId, team.id, actor.subject, "member.invited", person)
    }

    @Transactional(readOnly = true)
    fun prepareInvitation(code: String): UUID {
        require(code.length == 72)
        return registration.invitationId(settings.fingerprint(code)) ?: throw NoSuchElementException()
    }

    @Transactional(readOnly = true)
    fun pendingInvitation(actor: Actor, id: UUID): RosterPendingInvitation {
        sessions.requireActive(actor)
        val invitation = registration.invitation(id) ?: throw NoSuchElementException()
        check(!invitation.revoked && invitation.acceptedBy == null && invitation.expiresAt > clock.now())
        if (directory.verifiedEmail(actor.subject) != invitation.email) throw AccessDeniedException("Wrong invitation recipient")
        val team = management.team(invitation.teamId) ?: throw NoSuchElementException()
        val person = registration.person(team.organizationId, invitation.personId)
            ?: throw NoSuchElementException()
        return RosterPendingInvitation(id, person.name, team.name, invitation.email)
    }

    @Transactional
    fun acceptInvitation(actor: Actor, id: UUID): UUID {
        sessions.requireActive(actor)
        val initial = registration.invitation(id) ?: throw NoSuchElementException()
        check(management.lockTeam(initial.teamId) != null)
        check(registration.lockPerson(initial.organizationId, initial.personId) != null)
        sessions.requireActive(actor)
        val invitation = registration.invitation(id) ?: throw NoSuchElementException()
        val now = clock.now()
        check(!invitation.revoked && invitation.expiresAt > now)
        if (directory.verifiedEmail(actor.subject) != invitation.email) throw AccessDeniedException("Wrong invitation recipient")
        if (invitation.acceptedBy != null) {
            check(invitation.acceptedBy == actor.subject)
            return invitation.teamId
        }
        val team = management.team(invitation.teamId) ?: throw NoSuchElementException()
        val day = today(team)
        check(directory.activeAccount(invitation.inviter))
        check(management.allowed(invitation.inviter, team.organizationId, team.id, TeamPermission.MANAGE_ROSTER.key, day))
        check(registration.overlaps(team.id, invitation.personId, "participant", day) ||
            registration.overlaps(team.id, invitation.personId, "leader", day))
        check(registration.statuses(team.id).any { it.personId == invitation.personId && it.status == "sent" })
        check(directory.accounts(team.organizationId, listOf(invitation.personId)).isEmpty())
        directory.link(team.organizationId, invitation.personId, actor.subject)
        check(registration.accept(id, actor.subject) == 1)
        roster.audit(team.organizationId, team.id, actor.subject, "member.linked", invitation.personId)
        return team.id
    }

    private fun validate(team: ManagementTeamRow, command: RosterGroupCommand) {
        require(command.name.trim().length in 1..80)
        require(command.personIds.size <= 20000)
        val people = roster.members(team.id, today(team)).map { it.id }.toSet()
        require(command.personIds.all { it in people })
    }

    private fun lock(actor: Actor, teamId: UUID): ManagementTeamRow {
        val admittedTeam = authorize(actor, teamId)
        check(management.lockTeam(teamId) != null)
        val team = authorize(actor, teamId)
        check(team.organizationId == admittedTeam.organizationId)
        return team
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
