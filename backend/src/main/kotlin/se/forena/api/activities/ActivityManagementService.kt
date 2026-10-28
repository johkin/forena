package se.forena.api.activities

import java.time.Instant
import java.time.ZoneId
import java.util.UUID
import tools.jackson.databind.json.JsonMapper
import org.springframework.security.access.AccessDeniedException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional
import se.forena.api.activities.internal.*
import se.forena.api.identity.Actor
import se.forena.api.identity.DatabaseClockService
import se.forena.api.identity.SessionService

@Service
class ActivityManagementService(
    private val sessions: SessionService,
    private val clock: DatabaseClockService,
    private val management: ManagementRepository,
    private val activities: ManagedActivityRepository,
    private val types: ActivityTypeRepository,
    private val audits: ActivityAuditRepository,
    private val schedules: ActivityScheduleRepository,
    private val invitations: InvitationRepository,
    private val signals: ActivitySignalRepository,
    private val defaults: ActivityDefaultsRepository,
    private val groups: AudienceGroupRepository,
    private val groupMembers: AudienceMemberRepository,
    private val json: JsonMapper,
    private val dutyLifecycle: ActivityDutyLifecycleService
) {
    @Transactional(readOnly = true)
    fun canManageMemory(actor: Actor, teamId: UUID): Boolean {
        sessions.requireActive(actor)
        val team = management.team(teamId) ?: return false
        return allowed(actor,team,"assistant.memory.manage")
    }

    @Transactional(readOnly = true)
    fun canManageRoster(actor: Actor, teamId: UUID): Boolean {
        sessions.requireActive(actor)
        val team = management.team(teamId) ?: return false
        return allowed(actor,team,"roster.manage")
    }

    @Transactional(readOnly = true)
    fun canManageInvitations(actor: Actor, teamId: UUID): Boolean {
        sessions.requireActive(actor)
        val team = management.team(teamId) ?: return false
        return allowed(actor, team, "invitation.manage")
    }

    @Transactional(readOnly = true)
    fun canManageAttendance(actor: Actor, teamId: UUID): Boolean {
        sessions.requireActive(actor)
        val team = management.team(teamId) ?: return false
        return allowed(actor, team, "attendance.manage")
    }

    @Transactional(readOnly = true)
    fun canManageActivity(actor: Actor, teamId: UUID): Boolean {
        sessions.requireActive(actor)
        val team = management.team(teamId) ?: return false
        return allowed(actor, team, "activity.manage")
    }

    @Transactional(readOnly = true)
    fun teams(actor: Actor): List<ManagedTeam> {
        sessions.requireActive(actor)
        return management.teams(actor.subject).filter { allowed(actor, it, "activity.manage") }.map { teamDto(actor, it) }
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    fun context(actor: Actor, teamId: UUID): ActivityEditorContext {
        sessions.requireActive(actor)
        val team = requireTeam(actor, teamId)
        val catalogue = types.catalogue(team.organizationId).filter { it.active && applicable(it, team) }
        val members = if (allowed(actor, team, "invitation.manage")) participants(team) else emptyList()
        return ActivityEditorContext(teamDto(actor, team), catalogue.map {
            ManagedActivityType(it.id, it.name, it.slug, it.systemCategory, it.organizationId)
        }, members.map { ActivityParticipant(it.id, it.displayName, it.role) }, team.disciplineKey, team.sectionId,
            defaultRows(team).map { ActivityDefaultsRow(it.id, it.activityTypeId,
                if (it.teamId == null) "section" else "team", it.teamId ?: requireNotNull(it.sectionId),
                it.disciplineKey, it.version, it.revision, it.valuesJson) },
            if (allowed(actor, team, "invitation.manage")) audienceGroups(team) else emptyList(),
            activities.findByTeamIdOrderByStartsAtAsc(teamId).filter { it.deletedAt == null }.map(::activityDto))
    }

    @Transactional
    fun create(actor: Actor, command: ActivityCommand): ActivityResult {
        sessions.requireActive(actor)
        return createOccurrence(actor, command)
    }

    private fun createOccurrence(actor: Actor, command: ActivityCommand, seriesId: UUID? = null): ActivityResult {
        val teamId = requireNotNull(command.teamId)
        requireTeam(actor, teamId)
        check(management.lockTeam(teamId) != null)
        sessions.requireActive(actor)
        val team = requireTeam(actor, teamId)
        val zone = ZoneId.of(team.timeZone)
        ActivityTimes.validate(command, zone, creating = true)
        val type = requireType(team, command.activityTypeId)
        require(command.invitationMode in listOf("none", "now", "schedule"))
        val now = clock.now()
        val id = UUID.randomUUID()
        val schedulingCommand = if (command.timingRules == null) command.copy(timingRules = inheritedRules(team, type.id)) else command
        val schedule = if (command.invitationMode == "schedule") ActivityTimes.schedule(schedulingCommand, zone, now) else null
        val row = ManagedActivityEntity(id, team.organizationId, teamId, type.id,
            command.title.trim(), command.description.trim(), command.location.trim(),
            command.startsAt, command.endsAt, command.gatheringAt,
            if (command.invitationMode == "now") now else schedule?.second?.first(), schedule?.first,
            seriesId = seriesId, newRecord = true)
        applyInvitations(actor, team, row, command, schedule)
        record(actor, row, "created")
        return ActivityResult(activityDto(row))
    }

    @Transactional
    fun createSeries(actor: Actor, command: ActivitySeriesCommand): ActivitySeriesResult {
        sessions.requireActive(actor)
        val team = requireTeam(actor, command.teamId)
        require(command.timeZone == team.timeZone)
        val occurrences = ActivityTimes.weekly(command, ZoneId.of(team.timeZone))
        val seriesId = UUID.randomUUID()
        val created = occurrences.map { createOccurrence(actor, it, seriesId).activity }
        return ActivitySeriesResult(seriesId, created.size, created)
    }

    private fun applyInvitations(
        actor: Actor, team: ManagementTeamRow, row: ManagedActivityEntity, command: ActivityCommand,
        schedule: Pair<Instant, List<Instant>>?
    ) {
        val now = clock.now()
        require(command.invitationMode in listOf("none", "now", "schedule"))
        val roles = when (command.invitationAudience) {
            "players" -> listOf("participant")
            "leaders" -> listOf("leader")
            else -> command.invitationSelection?.roles.orEmpty().distinct()
        }
        val selectedGroups = command.invitationSelection?.groupIds.orEmpty().distinct()
        val selectedResponsibilities = command.invitationSelection?.responsibilityTypeIds.orEmpty().distinct()
        val personIds = command.personIds.distinct()
        if (command.invitationMode != "none") {
            if (!allowed(actor, team, "invitation.manage")) throw AccessDeniedException("Invitation permission required")
            val availableGroups = groups.findByTeamId(team.id)
            require(selectedGroups.all { id -> availableGroups.any { it.id == id && it.kind == "group" } })
            require(selectedResponsibilities.all { id -> availableGroups.any { it.id == id && it.kind == "responsibility" } })
            if (command.invitationMode == "now") {
                require(personIds.isNotEmpty() && personIds.size <= 1000)
                val availablePeople = participants(team).map { it.id }.toSet()
                require(personIds.all { it in availablePeople })
            } else {
                require(roles.isNotEmpty() || selectedGroups.isNotEmpty() || selectedResponsibilities.isNotEmpty())
                require(roles.all { it in listOf("participant", "leader") })
                require(command.invitationAudience in listOf(null, "selection", "players", "leaders"))
            }
        } else {
            require(personIds.isEmpty() && command.invitationSelection == null && command.invitationAudience == null)
        }
        val leaderAudience = if (command.invitationMode == "none") row.leadersOnly else
            (roles == listOf("leader") && selectedGroups.isEmpty() && selectedResponsibilities.isEmpty()) ||
                (personIds.isNotEmpty() && participants(team).filter { it.id in personIds }.all { it.role == "leader" })
        activities.save(row.copy(leadersOnly = leaderAudience))
        if (command.invitationMode == "none") return
        val existing = schedules.findByActivityId(row.activityId)
        for (entry in existing.filter { it.state == "pending" }) schedules.save(entry.copy(state = "cancelled"))
        if (command.invitationMode == "now") {
            for (person in personIds) invitations.create(UUID.randomUUID(), team.organizationId, row.activityId, person)
        }
        val times = schedule?.second ?: listOf(now)
        for ((index, due) in times.withIndex()) {
            val kind = if (index == 0) "invitation" else "reminder"
            val previous = existing.singleOrNull { it.kind == kind && it.dueAt == due }
            val entry = previous ?: ActivityScheduleEntity(null, row.activityId, team.organizationId, kind, due)
            schedules.save(
                entry.copy(
                    audienceRoles = roles.joinToString(","),
                    personIds = personIds.joinToString(","),
                    groupIds = selectedGroups.joinToString(","),
                    responsibilityTypeIds = selectedResponsibilities.joinToString(","),
                )
            )
        }
    }

    @Transactional
    fun update(actor: Actor, id: UUID, command: ActivityCommand): ActivityResult {
        val current = lock(actor, id)
        require(command.teamId == null || command.teamId == current.teamId)
        check(current.status == "scheduled" && current.endsAt > clock.now())
        command.revision?.let { check(it == current.revision) }
        val team = requireTeam(actor, current.teamId)
        ActivityTimes.validate(command, ZoneId.of(team.timeZone), creating = false)
        if (command.invitationMode != "schedule") require(current.responseDueAt == null || current.responseDueAt <= command.startsAt)
        val typeId = command.activityTypeId ?: current.activityTypeId
        if (typeId != current.activityTypeId) requireType(team, typeId)
        val changed = current.copy(activityTypeId = typeId, title = command.title.trim(),
            description = command.description.trim(), location = command.location.trim(),
            startsAt = command.startsAt, endsAt = command.endsAt, gatheringAt = command.gatheringAt,
            revision = current.revision + 1)
        val now = clock.now()
        val schedulingCommand = if (command.invitationMode == "schedule" && command.timingRules == null)
            command.copy(timingRules = inheritedRules(team, requireType(team, typeId).id)) else command
        val schedule = if (command.invitationMode == "schedule")
            ActivityTimes.schedule(schedulingCommand, ZoneId.of(team.timeZone), now) else null
        val withInvitations = when (command.invitationMode) {
            "none" -> changed
            "now" -> changed.copy(invitationSendAt = now)
            "schedule" -> changed.copy(
                // Previously sent invitations and their answers remain visible.
                invitationSendAt = if ((current.invitationSendAt == null || current.invitationSendAt <= now) &&
                    invitations.existsByActivityId(id)) current.invitationSendAt ?: now else schedule?.second?.first(),
                responseDueAt = schedule?.first)
            else -> throw IllegalArgumentException("Unknown invitation mode")
        }
        applyInvitations(actor, team, withInvitations, command, schedule)
        record(actor, withInvitations, "updated")
        return ActivityResult(activityDto(withInvitations))
    }

    @Transactional
    fun cancel(actor: Actor, id: UUID, command: CancellationCommand): ActivityDisposition {
        val current = lock(actor, id)
        command.revision?.let { check(it == current.revision) }
        if (current.deletedAt != null) throw NoSuchElementException()
        require(command.action in listOf("cancel", "delete"))
        if (command.action == "delete") {
            check(!hasSentInvitations(current)) { "Skickade kallelser hindrar borttagning." }
            val deleted = current.copy(status = "cancelled", deletedAt = clock.now(), revision = current.revision + 1)
            activities.save(deleted)
            schedules.findByActivityId(id).filter { it.state == "pending" }.forEach { schedules.save(it.copy(state = "cancelled")) }
            record(actor, deleted, "deleted")
            return ActivityDisposition("deleted")
        }
        if (current.status == "cancelled") return ActivityDisposition()
        check(current.endsAt > clock.now())
        require(command.reason == null || command.reason.length <= 500)
        val cancelled = current.copy(status = "cancelled", cancelledAt = clock.now(),
            cancellationReason = command.reason?.trim()?.ifEmpty { null } ?: "Inställd av ledare",
            revision = current.revision + 1)
        activities.save(cancelled)
        dutyLifecycle.follow(cancelled.activityId,cancelled.startsAt,cancelled.endsAt,true)
        for (schedule in schedules.findByActivityId(id).filter { it.state == "pending" }) {
            schedules.save(schedule.copy(state = "cancelled"))
        }
        record(actor, cancelled, "cancelled")
        return ActivityDisposition()
    }

    @Transactional(readOnly = true)
    fun disposition(actor: Actor, id: UUID): ActivityDeletionOptions {
        val row = activities.findById(id).orElseThrow { NoSuchElementException() }
        sessions.requireActive(actor)
        requireTeam(actor, row.teamId)
        if (row.deletedAt != null) throw NoSuchElementException()
        return ActivityDeletionOptions(!hasSentInvitations(row))
    }

    private fun hasSentInvitations(row: ManagedActivityEntity): Boolean =
        invitations.existsByActivityId(row.activityId) && (row.invitationSendAt == null || row.invitationSendAt <= clock.now())

    private fun lock(actor: Actor, id: UUID): ManagedActivityEntity {
        sessions.requireActive(actor)
        val identity = activities.findById(id).orElseThrow { NoSuchElementException() }
        requireTeam(actor, identity.teamId)
        val current = activities.findLockedByActivityId(id) ?: throw NoSuchElementException()
        if (current.deletedAt != null) throw NoSuchElementException()
        // Same lifecycle lock/order as InvitationService; recheck after any lock wait.
        sessions.requireActive(actor)
        requireTeam(actor, current.teamId)
        return current
    }

    private fun requireTeam(actor: Actor, id: UUID): ManagementTeamRow {
        val team = management.team(id) ?: throw NoSuchElementException()
        if (!allowed(actor, team, "activity.manage")) throw AccessDeniedException("Activity permission required")
        return team
    }

    private fun allowed(actor: Actor, team: ManagementTeamRow, permission: String): Boolean =
        management.allowed(actor.subject, team.organizationId, team.id, permission,
            clock.now().atZone(ZoneId.of(team.timeZone)).toLocalDate())

    private fun participants(team: ManagementTeamRow) =
        management.participants(team.id, clock.now().atZone(ZoneId.of(team.timeZone)).toLocalDate())

    private fun applicable(type: ActivityTypeEntity, team: ManagementTeamRow) =
        type.disciplineKey == null || type.disciplineKey == team.disciplineKey

    private fun defaultRows(team: ManagementTeamRow) = defaults.defaults(team.organizationId, team.id,
        team.sectionId, team.disciplineKey ?: "common")

    private fun inheritedRules(team: ManagementTeamRow, type: UUID): ActivityTimingRules {
        var rules = ActivityTimingRules()
        val rows = defaultRows(team).filter { it.activityTypeId == type }.sortedBy { it.teamId != null }
        for (row in rows) {
            check(row.version == "1.0.0")
            val patch = json.readValue(row.valuesJson, ActivityDefaultsPatch::class.java)
            rules = ActivityTimingRules(patch.duration ?: rules.duration, patch.gatheringRule ?: rules.gatheringRule,
                patch.invitationRule ?: rules.invitationRule, patch.responseDueRule ?: rules.responseDueRule,
                patch.reminderRules ?: rules.reminderRules)
        }
        return rules
    }

    private fun audienceGroups(team: ManagementTeamRow): List<ActivityAudienceGroup> {
        val rows = groups.findByTeamId(team.id)
        val members = if (rows.isEmpty()) emptyList() else groupMembers.findByGroupIdInAndActiveTrue(rows.map { it.id })
        val allowedPeople = participants(team).map { it.id }.toSet()
        return rows.map { row -> ActivityAudienceGroup(row.id, row.name, row.kind,
            members.filter { it.groupId == row.id && it.personId in allowedPeople }.map { it.personId }) }
    }

    private fun requireType(team: ManagementTeamRow, id: UUID?): ActivityTypeEntity =
        types.catalogue(team.organizationId).singleOrNull {
            (if (id == null) it.slug == "ovrigt" && it.organizationId == null else it.id == id) && it.active && applicable(it, team)
        } ?: throw IllegalArgumentException("Activity type unavailable")

    private fun teamDto(actor: Actor, row: ManagementTeamRow) = ManagedTeam(row.id, row.organizationId,
        row.name, row.organizationName, row.timeZone, allowed(actor, row, "invitation.manage"))

    private fun activityDto(row: ManagedActivityEntity) = ManagedActivity(row.activityId, row.organizationId,
        row.teamId, row.activityTypeId, row.title, row.description, row.location,
        row.startsAt, row.endsAt, row.gatheringAt, row.status, row.revision)

    private fun record(actor: Actor, row: ManagedActivityEntity, operation: String) {
        val now = clock.now()
        audits.save(ActivityAuditEntity(null, row.activityId, row.organizationId, actor.subject, operation, row.revision, now))
        val signal = signals.findById(row.activityId).orElse(null)
        signals.save(signal?.copy(dirtyRevision = signal.dirtyRevision + 1, changedAt = now)
            ?: ActivitySignalEntity(row.activityId, 1, now, newRecord = true))
    }
}
