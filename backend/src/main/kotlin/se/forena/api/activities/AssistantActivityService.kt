package se.forena.api.activities

import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID
import org.springframework.security.access.AccessDeniedException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import se.forena.api.activities.internal.*
import se.forena.api.activities.internal.AssistantActivityRepository
import se.forena.api.identity.*

@Service
class AssistantActivityService(
    private val sessions: SessionService,
    private val teamAccess: TeamAccessService,
    private val clock: DatabaseClockService,
    private val management: ActivityManagementService,
    private val overview: PersonalOverviewService,
    private val teams: ManagementRepository,
    private val activities: ManagedActivityRepository,
    private val invitations: InvitationRepository,
    private val access: PersonAccessService,
    private val repository: AssistantActivityRepository,
) {
    @Transactional(readOnly = true)
    fun catalogActivities(actor: Actor): List<PersonalActivity> {
        val personal = overview.overview(actor).activities
        val extraTeams =
            catalogTeams(actor).filter {
                management.canManageInvitations(actor, it.id) &&
                    !management.canManageActivity(actor, it.id) &&
                    !management.canManageAttendance(actor, it.id)
            }
        val additional = extraTeams.flatMap { team ->
            activities
                .findByTeamIdOrderByStartsAtAsc(team.id)
                .filter {
                    it.deletedAt == null && it.status == "scheduled" && it.endsAt > clock.now()
                }
                .map { activity(actor, it.activityId) }
        }
        check(personal.size + additional.size <= 20_000)
        return (personal + additional).distinctBy { it.id }.sortedBy { it.starts_at }
    }

    @Transactional(readOnly = true)
    fun activity(actor: Actor, id: UUID): PersonalActivity {
        sessions.requireActive(actor)
        overview.optionalActivity(actor, id)?.let {
            return it
        }
        val row = activities.findById(id).orElseThrow { NoSuchElementException() }
        if (row.deletedAt != null || !management.canManageInvitations(actor, row.teamId))
            throw NoSuchElementException()
        val team = requireNotNull(teams.team(row.teamId))
        val own = access.people(actor, row.organizationId).map { it.id }.toSet()
        val ownInvitations =
            if (row.invitationSendAt?.isAfter(clock.now()) == true) emptyList()
            else invitations(actor, id).filter { it.personId in own }
        return PersonalActivity(
            row.activityId,
            row.title,
            row.startsAt,
            row.endsAt,
            row.gatheringAt,
            row.responseDueAt,
            row.location,
            row.description,
            row.status,
            PersonalOrganization(row.organizationId, team.organizationName, team.timeZone, null),
            PersonalTeam(team.id, team.organizationId, team.name, listOf("invitation_access")),
            ownInvitations.map { person ->
                ActivityPerson(
                    person.personId,
                    person.name,
                    AccessibleInvitation(
                        person.id,
                        person.personId,
                        InvitationResponse.fromDatabase(person.response),
                        person.responseComment,
                        person.name,
                    ),
                )
            },
            false,
            management.canManageAttendance(actor, row.teamId),
        )
    }

    @Transactional(readOnly = true)
    fun catalogTeams(actor: Actor): List<AssistantTeam> {
        sessions.requireActive(actor)
        return teams
            .teams(actor.subject)
            .filter { teamAccess.hasAssistantManagementAccess(actor, it.id) }
            .map { AssistantTeam(it.id, it.organizationId, it.name) }
    }

    @Transactional(readOnly = true)
    fun team(actor: Actor, id: UUID): AssistantTeamData {
        sessions.requireActive(actor)
        val team = teams.team(id) ?: throw NoSuchElementException()
        val authorized = teamAccess.hasAssistantManagementAccess(actor, id)
        if (!authorized && overview.overview(actor).teams.none { it.id == id })
            throw AccessDeniedException("Team access required")
        val canRoster = teamAccess.canManageRoster(actor, id)
        val today = clock.now().atZone(ZoneId.of(team.timeZone)).toLocalDate()
        return AssistantTeamData(
            id,
            team.organizationId,
            team.name,
            team.organizationName,
            team.sectionId,
            team.disciplineKey,
            team.timeZone,
            if (management.canManageActivity(actor, id)) management.context(actor, id) else null,
            management.canManageInvitations(actor, id),
            management.canManageAttendance(actor, id),
            if (canRoster)
                teams.participants(id, today).map {
                    AssistantRosterPerson(it.id, it.displayName, it.role)
                }
            else emptyList(),
        )
    }

    @Transactional(readOnly = true)
    fun invitations(actor: Actor, id: UUID): List<AssistantInvitation> {
        sessions.requireActive(actor)
        val activity = activities.findById(id).orElseThrow { NoSuchElementException() }
        if (activity.deletedAt != null || activity.invitationSendAt?.isAfter(clock.now()) == true)
            throw NoSuchElementException()
        val all = management.canManageInvitations(actor, activity.teamId)
        val own = access.people(actor, activity.organizationId).map { it.id }.toSet()
        // No actor-controlled SQL identifiers. The explicit scope applies before rows reach a
        // model.
        return repository.findInvitations(id).filter { all || it.personId in own }
    }

    @Transactional(readOnly = true)
    fun history(actor: Actor, team: UUID, from: LocalDate, through: LocalDate): AssistantHistory {
        val data = team(actor, team)
        if (!data.attendanceAccess && !data.invitationAccess)
            throw AccessDeniedException("History permission required")
        require(
            !through.isBefore(from) &&
                java.time.temporal.ChronoUnit.DAYS.between(from, through) < 366
        )
        val zone = ZoneId.of(data.timeZone)
        val start = from.atStartOfDay(zone).toInstant()
        val end = through.plusDays(1).atStartOfDay(zone).toInstant()
        val work =
            if (!data.invitationAccess) emptyList()
            else repository.findDutyHistory(team, start, end)
        if (!data.attendanceAccess)
            return AssistantHistory(
                from,
                through,
                null,
                null,
                work.size > 200,
                emptyList(),
                duties = work.take(200),
                attendanceAvailable = false,
            )
        val rows = repository.findAttendanceHistory(team, start, end)
        val count = repository.countParticipations(team, start, end)
        val people = repository.countUniqueParticipants(team, start, end)
        val summaries = repository.summarizeAttendance(team, start, end)
        return AssistantHistory(
            from,
            through,
            people,
            count,
            rows.size > 200 || work.size > 200,
            rows.take(200),
            summaries,
            work.take(200),
        )
    }

    @Transactional
    fun respond(
        actor: Actor,
        changes: List<Pair<UUID, ResponseChange>>,
        expected: Map<UUID, Long>,
        responder: InvitationService,
    ) {
        // Every actor/target is authorized by the same application command used on the web.
        for ((id, _) in changes.sortedBy { it.first.toString() }) {
            val row =
                invitations.findById(id).orElseThrow {
                    AccessDeniedException("Invitation unavailable")
                }
            if (!access.canActFor(actor, row.personId, row.organizationId))
                throw AccessDeniedException("Invitation unavailable")
            check(activities.findLockedByActivityId(row.activityId) != null)
            val current =
                invitations.findLockedByIdAndOrganizationIdAndActivityIdAndPersonId(
                    id,
                    row.organizationId,
                    row.activityId,
                    row.personId,
                ) ?: throw AccessDeniedException("Invitation unavailable")
            check(current.revision == expected[id])
        }
        changes.forEach { (id, change) -> responder.respond(actor, id, change) }
    }

    @Transactional
    fun queueReminder(actor: Actor, id: UUID) {
        val activity = activities.findById(id).orElseThrow { NoSuchElementException() }
        if (!management.canManageInvitations(actor, activity.teamId))
            throw AccessDeniedException("Invitation permission required")
        check(activities.findLockedByActivityId(id) != null)
        sessions.requireActive(actor)
        check(management.canManageInvitations(actor, activity.teamId))
        val now = clock.now()
        val current = activities.findById(id).orElseThrow { NoSuchElementException() }
        check(
            current.deletedAt == null &&
                current.status == "scheduled" &&
                current.endsAt > now &&
                (current.responseDueAt == null || current.responseDueAt > now) &&
                (current.invitationSendAt == null || current.invitationSendAt <= now)
        )
        val pending = invitations(actor, id).filter { it.response == "pending" }
        check(pending.isNotEmpty())
        check(!repository.hasPendingReminder(id))
        repository.scheduleReminder(
            UUID.randomUUID(),
            id,
            current.organizationId,
            now,
            pending.joinToString(",") { it.personId.toString() },
        )
    }

    @Transactional
    fun lockActivity(actor: Actor, id: UUID) {
        activity(actor, id)
        check(activities.findLockedByActivityId(id) != null)
        sessions.requireActive(actor)
    }

    @Transactional(readOnly = true)
    fun invitationState(actor: Actor, id: UUID): InvitationChannelState {
        sessions.requireActive(actor)
        val row =
            invitations.findById(id).orElseThrow { AccessDeniedException("Invitation unavailable") }
        if (!access.canActFor(actor, row.personId, row.organizationId))
            throw AccessDeniedException("Invitation unavailable")
        val activity = activities.findById(row.activityId).orElseThrow { NoSuchElementException() }
        overview.activity(actor, row.activityId)
        val person = access.people(actor, row.organizationId).single { it.id == row.personId }
        return InvitationChannelState(
            id,
            row.personId,
            person.name,
            row.activityId,
            activity.revision,
            row.revision,
            row.response,
            activity.organizationId,
            activity.teamId,
        )
    }
}
