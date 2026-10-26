package se.forena.api.activities

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException
import se.forena.api.activities.internal.*
import se.forena.api.identity.Actor
import se.forena.api.identity.SessionService
import se.forena.api.identity.DatabaseClockService
import se.forena.api.identity.PersonAccessService

@Service
class PersonalOverviewService(
    private val sessions: SessionService,
    private val clock: DatabaseClockService,
    private val access: PersonAccessService,
    private val activities: PersonalActivityRepository,
    private val invitations: InvitationRepository,
    private val memberships: TeamMembershipRepository,
    private val assignments: TeamAccessAssignmentRepository,
    private val organizationMembers: OrganizationMemberRepository,
    private val organizations: OrganizationRepository,
    private val teams: TeamRepository,
    private val management: ActivityManagementService
) {
    // Counts, participant rows, roles and invitations must come from the same authorized snapshot.
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    fun overview(actor: Actor): PersonalOverview = read(actor, null)

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    fun activity(actor: Actor, id: UUID): PersonalActivity = read(actor, id).activities.single()

    private fun read(actor: Actor, id: UUID?): PersonalOverview {
        sessions.requireActive(actor)
        val now = clock.now()
        val people = access.people(actor)
        val ownPeople = people.filter { it.kind == "self" }.map { it.id }
        val relations = if (people.isEmpty()) emptyList() else memberships.findByPersonIdInAndActiveTrue(people.map { it.id })
        // Delegation does not inherit another person's independent team-access assignment.
        val grants = if (ownPeople.isEmpty()) emptyList() else assignments.findByPersonIdInAndActiveTrue(ownPeople)
        val managedTeams = management.teams(actor)
        val managedTeamIds = managedTeams.map { it.id }.toSet()
        val orgMemberships = organizationMembers.findBySubjectAndActiveTrue(actor.subject)
        val orgIds = (people.map { it.organizationId } + orgMemberships.map { it.organizationId } +
            managedTeams.map { it.organizationId }).distinct()
        val orgRows = if (orgIds.isEmpty()) emptyList() else organizations.findByIdInOrderByNameAsc(orgIds)
        val organizationDtos = orgRows.map { org -> PersonalOrganization(org.id, org.name, org.timeZone,
            orgMemberships.singleOrNull { it.organizationId == org.id }?.role) }
        val byOrganization = organizationDtos.associateBy { it.id }
        // Boolean guards disable empty scopes; placeholders only keep SQL IN lists valid.
        val noId = listOf(UUID(0, 0))
        val personIds = people.map { it.id }.ifEmpty { noId }
        val ownIds = ownPeople.ifEmpty { noId }
        val managerIds = managedTeamIds.toList().ifEmpty { noId }
        val rows = if (id == null)
            activities.findUpcoming(personIds, ownIds, ownPeople.isNotEmpty(), people.isNotEmpty(), managerIds, managedTeamIds.isNotEmpty(), now)
        else listOfNotNull(activities.findAccessible(id, personIds, ownIds, ownPeople.isNotEmpty(), people.isNotEmpty(), managerIds, managedTeamIds.isNotEmpty()))
        if (id != null && rows.isEmpty()) throw NoSuchElementException("Aktiviteten kunde inte hittas.")
        // Match the legacy completeness guard: fail explicitly, never publish partial counts/calendar.
        if (rows.size > 20_000) throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE)
        val teamIds = (rows.map { it.teamId } + relations.map { it.teamId } +
            grants.map { it.teamId } + managedTeamIds).distinct()
        val teamRows = if (teamIds.isEmpty()) emptyList() else teams.findByIdInOrderByNameAsc(teamIds)
        val peopleById = people.associateBy { it.id }
        val membershipByTeam = relations.groupBy { it.teamId }
        val accessByTeam = grants.groupBy { it.teamId }
        val byTeam = teamRows.associate { team ->
            val org = byOrganization.getValue(team.organizationId)
            val today = now.atZone(ZoneId.of(org.time_zone)).toLocalDate()
            val roles = linkedSetOf<String>()
            if (team.id in managedTeamIds) roles += "team_access"
            for (member in membershipByTeam[team.id].orEmpty().filter { covers(it.startsOn, it.endsOn, today) }) {
                roles += if (peopleById.getValue(member.personId).kind == "self") member.role else "guardian"
            }
            if (accessByTeam[team.id].orEmpty().any { covers(it.startsOn, it.endsOn, today) }) roles += "team_access"
            team.id to PersonalTeam(team.id, team.organizationId, team.name, roles.toList())
        }
        val invitationRows = if (rows.isEmpty() || people.isEmpty()) emptyList() else
            invitations.findByActivityIdInAndPersonIdIn(rows.map { it.id }, people.map { it.id })
        val byActivity = invitationRows.groupBy { it.activityId }
        val result = rows.map { row ->
            val org = byOrganization.getValue(row.organizationId)
            val date = row.startsAt.atZone(ZoneId.of(org.time_zone)).toLocalDate()
            val invited = byActivity[row.id].orEmpty().associateBy { it.personId }
            val related = (invited.keys + membershipByTeam[row.teamId].orEmpty()
                .filter { covers(it.startsOn, it.endsOn, date) }.map { it.personId } +
                accessByTeam[row.teamId].orEmpty().filter { covers(it.startsOn, it.endsOn, date) }.map { it.personId }).toSet()
            val personRows = related.map { personId ->
                val person = peopleById.getValue(personId)
                val invitation = invited[personId]?.takeUnless { row.invitationSendAt?.isAfter(now) == true }
                ActivityPerson(person.id, person.name, invitation?.let {
                    AccessibleInvitation(it.id, person.id, InvitationResponse.fromDatabase(it.response), it.responseComment, person.name)
                })
            }.sortedWith(compareBy<ActivityPerson> { it.name }.thenBy { it.id })
            PersonalActivity(row.id, row.title, row.startsAt, row.endsAt, row.gatheringAt, row.responseDueAt,
                row.location, row.description, row.status, org, byTeam.getValue(row.teamId), personRows, row.teamId in managedTeamIds)
        }
        return PersonalOverview(now, result, organizationDtos, byTeam.values.filter { it.roles.isNotEmpty() })
    }

    private fun covers(start: LocalDate, end: LocalDate?, date: LocalDate) = start <= date && (end == null || end >= date)
}
