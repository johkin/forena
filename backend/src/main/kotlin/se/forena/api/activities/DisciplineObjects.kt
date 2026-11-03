package se.forena.api.activities

import java.time.ZoneId
import java.util.UUID
import org.springframework.security.access.AccessDeniedException
import org.springframework.stereotype.Service
import se.forena.api.activities.internal.*
import se.forena.api.extensionapi.*
import se.forena.api.identity.Actor
import se.forena.api.identity.DatabaseClockService
import se.forena.api.identity.PersonAccessService
import se.forena.api.identity.SessionService

/** Public, permission-checked activity facts. Extensions never read activity repositories. */
@Service
class DisciplineObjects(
    private val sessions: SessionService,
    private val access: TeamAccessService,
    private val people: PersonAccessService,
    private val clock: DatabaseClockService,
    private val teams: ManagementRepository,
    private val activities: ManagedActivityRepository,
    private val types: ActivityTypeRepository,
    private val repository: DisciplineObjectRepository,
) {
    fun roster(actor: Actor, teamId: UUID): List<DisciplinePlayer> {
        sessions.requireActive(actor)
        val team = teams.team(teamId) ?: throw NoSuchElementException()
        val today = clock.now().atZone(ZoneId.of(team.timeZone)).toLocalDate()
        val manager = access.canManageRoster(actor, teamId)
        val member =
            people.people(actor, team.organizationId).any {
                repository.member(teamId, it.id, today)
            }
        if (!manager && !member) throw AccessDeniedException("Team membership required")
        return teams
            .participants(teamId, today)
            .filter { it.role == "participant" }
            .map { DisciplinePlayer(it.id, it.displayName) }
    }

    fun resolve(
        actor: Actor,
        target: DisciplineTarget,
        writing: Boolean = false,
    ): DisciplineObject {
        sessions.requireActive(actor)
        require(
            (target.scope in
                setOf(DisciplineScope.activity, DisciplineScope.activityParticipation)) ==
                (target.activityId != null)
        )
        require(
            (target.scope in
                setOf(DisciplineScope.teamMembership, DisciplineScope.activityParticipation)) ==
                (target.personId != null)
        )
        require(target.scope != DisciplineScope.section)
        val team = teams.team(target.teamId) ?: throw NoSuchElementException()
        val permission =
            if (target.scope == DisciplineScope.teamMembership) TeamPermission.MANAGE_ROSTER
            else TeamPermission.MANAGE_ACTIVITIES
        val manager = access.allowed(actor, team, permission)
        val today = clock.now().atZone(ZoneId.of(team.timeZone)).toLocalDate()
        val member =
            people.people(actor, team.organizationId).any {
                repository.member(team.id, it.id, today)
            }
        var invite = access.allowed(actor, team, TeamPermission.MANAGE_INVITATIONS)
        if (!manager && !(target.scope == DisciplineScope.teamMembership && member))
            throw AccessDeniedException("Discipline access required")
        if (target.scope == DisciplineScope.activityParticipation && !invite)
            throw AccessDeniedException("Invitation access required")
        if (writing && !manager) throw AccessDeniedException("Discipline write access required")
        // Admission precedes waiting; recheck rights after the same lock used by activity writes.
        val activity =
            target.activityId?.let { id ->
                val row =
                    if (writing) activities.findLockedByActivityId(id)
                    else activities.findById(id).orElse(null)
                row?.takeIf {
                    it.teamId == team.id &&
                        it.organizationId == team.organizationId &&
                        it.deletedAt == null
                } ?: throw NoSuchElementException()
            }
        if (writing && activity == null) check(teams.lockTeam(team.id) != null)
        if (writing && !access.allowed(actor, team, permission))
            throw AccessDeniedException("Discipline write access required")
        if (writing) invite = access.allowed(actor, team, TeamPermission.MANAGE_INVITATIONS)
        if (writing && target.scope == DisciplineScope.activityParticipation && !invite)
            throw AccessDeniedException("Invitation write access required")
        val date = activity?.startsAt?.atZone(ZoneId.of(team.timeZone))?.toLocalDate() ?: today
        val players =
            teams
                .participants(team.id, date)
                .filter { it.role == "participant" }
                .map { DisciplinePlayer(it.id, it.displayName) }
        if (target.scope == DisciplineScope.teamMembership)
            require(repository.member(team.id, requireNotNull(target.personId), today))
        val participants =
            if (activity != null && invite) repository.players(activity.activityId, team.id, date)
            else emptyList()
        if (target.scope == DisciplineScope.activityParticipation)
            require(participants.any { it.id == target.personId })
        val accepted =
            if (activity != null && invite)
                repository.acceptedPlayers(activity.activityId, team.id, date)
            else emptyList()
        val kind =
            activity
                ?.activityTypeId
                ?.let { id -> types.catalogue(team.organizationId).singleOrNull { it.id == id } }
                ?.let { ActivityKind(it.slug, it.systemCategory) }
        return DisciplineObject(
            team.organizationId,
            team.id,
            activity?.activityId ?: target.personId ?: team.id,
            team.disciplineKey ?: "common",
            activity?.activityId,
            target.personId,
            manager &&
                (activity == null ||
                    (!activity.imported &&
                        activity.status == "scheduled" &&
                        activity.endsAt > clock.now())),
            manager,
            invite,
            member,
            DisciplineValidationContext(
                kind,
                players.map { it.id }.toSet(),
                accepted.map { it.id }.toSet(),
            ),
            if (invite) players else emptyList(),
            accepted,
            participants,
        )
    }
}
