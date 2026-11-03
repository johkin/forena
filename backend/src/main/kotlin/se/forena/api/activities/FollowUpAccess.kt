package se.forena.api.activities

import java.time.Instant
import java.time.ZoneId
import java.util.UUID
import org.springframework.security.access.AccessDeniedException
import org.springframework.stereotype.Service
import se.forena.api.activities.internal.*
import se.forena.api.extensionapi.DisciplineCatalog
import se.forena.api.identity.Actor
import se.forena.api.identity.DatabaseClockService
import se.forena.api.identity.SessionService
import tools.jackson.databind.json.JsonMapper

/** Public facts boundary; extensions never access activities' internal storage. */
@Service
class FollowUpAccess(
    private val repository: FollowUpActivityRepository,
    private val activities: ManagedActivityRepository,
    private val attendance: AttendanceRepository,
    private val permissions: TeamAccessService,
    private val sessions: SessionService,
    private val clock: DatabaseClockService,
    private val teams: ManagementRepository,
    private val defaults: ActivityDefaultsRepository,
    private val catalog: DisciplineCatalog,
    private val json: JsonMapper,
) {
    fun authorizeTeam(actor: Actor, teamId: UUID) {
        sessions.requireActive(actor)
        if (!repository.leader(actor.subject, teamId, clock.now()))
            throw AccessDeniedException("Team leader access required")
    }

    fun facts(actor: Actor, id: UUID, lock: Boolean = false): FollowUpFacts {
        val initial = repository.activity(id) ?: throw NoSuchElementException()
        authorizeTeam(actor, initial.teamId)
        if (lock) check(activities.findLockedByActivityId(id) != null)
        val current = repository.activity(id) ?: throw NoSuchElementException()
        check(initial.teamId == current.teamId && initial.organizationId == current.organizationId)
        authorizeTeam(actor, current.teamId)
        if (current.deletedAt != null) throw NoSuchElementException()
        val report = attendance.report(id)
        return FollowUpFacts(
            current,
            report?.revision ?: 0,
            if (report == null) emptyList()
            else
                attendance
                    .people(id)
                    .filter { it.present == true && it.role == "participant" }
                    .map { DisciplinePlayer(it.personId, it.displayName) },
            permissions.canManageAttendance(actor, current.teamId),
        )
    }

    fun teamActivities(
        actor: Actor,
        teamId: UUID,
        from: Instant,
        until: Instant,
    ): List<FollowUpActivity> {
        authorizeTeam(actor, teamId)
        require(until > from)
        val rows = repository.teamActivities(teamId, from, until)
        check(rows.size <= 20000)
        return rows
    }

    /** Trusted background adapter; callers must already hold the activity transaction. */
    fun systemActivity(id: UUID): FollowUpActivity? = repository.activity(id)

    fun lockSystemActivity(id: UUID): FollowUpActivity? {
        activities.findLockedByActivityId(id) ?: return null
        return repository.activity(id)
    }

    fun leaderRecipients(teamId: UUID) = repository.leaderRecipients(teamId, clock.now())

    fun players(actor: Actor, teamId: UUID, activityIds: List<UUID>): List<DisciplinePlayer> {
        authorizeTeam(actor, teamId)
        return if (activityIds.isEmpty()) emptyList() else repository.players(teamId, activityIds)
    }

    fun teamDiscipline(actor: Actor, teamId: UUID): String {
        authorizeTeam(actor, teamId)
        return repository.teamDiscipline(teamId) ?: throw NoSuchElementException()
    }

    fun reportPeriod(actor: Actor, team: UUID): TeamReportPeriod {
        authorizeTeam(actor, team)
        return repository.period(team) ?: throw NoSuchElementException()
    }

    fun capabilityCounts(activity: UUID) = repository.capabilityCounts(activity)

    fun capabilityRecipients(teamId: UUID): List<UUID> {
        val team = teams.team(teamId) ?: return emptyList()
        val now = clock.now()
        val date = now.atZone(ZoneId.of(team.timeZone)).toLocalDate()
        return repository.associatedSubjects(teamId, now).filter {
            teams.allowed(
                it,
                team.organizationId,
                teamId,
                TeamPermission.MANAGE_INVITATIONS.key,
                date,
            )
        }
    }

    fun authorizeSignals(actor: Actor, team: UUID) {
        sessions.requireActive(actor)
        if (!permissions.canManageInvitations(actor, team))
            throw AccessDeniedException("Invitation access required")
    }

    fun capabilitySettings(activity: UUID): List<CapabilityCreationSettings> {
        val row = activities.findById(activity).orElseThrow()
        val team = teams.team(row.teamId) ?: throw NoSuchElementException()
        val pkg = catalog.find(team.disciplineKey ?: "common") ?: return emptyList()
        val patches =
            defaults
                .defaults(team.organizationId, team.id, team.sectionId, pkg.definition.key)
                .filter { it.activityTypeId == row.activityTypeId }
                .sortedBy { it.teamId != null }
                .map { json.readTree(it.valuesJson) }
        return pkg.activityCapabilities.map { capability ->
            var enabled = capability.definition.enabledByDefault
            var hours = capability.defaultHours
            patches.forEach { patch ->
                patch.get("capabilities")?.get(capability.definition.key)?.let { value ->
                    value
                        .get("notificationsEnabled")
                        ?.takeUnless { it.isNull }
                        ?.let { enabled = it.booleanValue() }
                    value
                        .get("notificationHours")
                        ?.takeUnless { it.isNull }
                        ?.let { hours = it.toList().map { h -> h.intValue() } }
                }
            }
            CapabilityCreationSettings(
                capability.definition.key,
                capability.definition.version,
                enabled,
                hours,
            )
        }
    }

    fun futureActivityIds(team: UUID) = repository.futureActivityIds(team)

    fun now() = clock.now()
}
