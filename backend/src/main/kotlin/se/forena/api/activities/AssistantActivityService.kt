package se.forena.api.activities

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.access.AccessDeniedException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import se.forena.api.activities.internal.*
import se.forena.api.identity.*

data class AssistantInvitation(
    val id: UUID,
    val personId: UUID,
    val name: String,
    val response: String,
    val responseComment: String?,
    val revision: Long,
)

data class AssistantRosterPerson(val id: UUID, val displayName: String, val role: String)

data class AssistantTeamData(
    val teamId: UUID,
    val organizationId: UUID,
    val teamName: String,
    val organizationName: String,
    val sectionId: UUID?,
    val discipline: String?,
    val timeZone: String,
    val editor: ActivityEditorContext?,
    val invitationAccess: Boolean,
    val attendanceAccess: Boolean,
    val roster: List<AssistantRosterPerson>,
)

data class HistoryPerson(
    val activityId: UUID,
    val title: String,
    val startsAt: Instant,
    val personId: UUID,
    val name: String,
    val present: Boolean?,
    val category: String,
)

data class AssistantHistory(
    val from: LocalDate,
    val through: LocalDate,
    val uniquePeople: Long?,
    val participationCount: Long?,
    val truncated: Boolean,
    val records: List<HistoryPerson>,
    val summaries: List<HistorySummary> = emptyList(),
    val duties: List<DutyHistory> = emptyList(),
    val attendanceAvailable: Boolean = true,
)

data class HistorySummary(
    val category: String,
    val uniquePeople: Long,
    val participationCount: Long,
)

data class DutyHistory(
    val activityId: UUID,
    val title: String,
    val startsAt: Instant,
    val personId: UUID,
    val name: String,
    val duty: String,
    val completed: Boolean,
)

@Service
class AssistantActivityService(
    private val sessions: SessionService,
    private val clock: DatabaseClockService,
    private val management: ActivityManagementService,
    private val overview: PersonalOverviewService,
    private val teams: ManagementRepository,
    private val activities: ManagedActivityRepository,
    private val invitations: InvitationRepository,
    private val access: PersonAccessService,
    private val jdbc: JdbcClient,
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
        overview.optionalActivity(actor, id)?.let { return it }
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
            .filter { team ->
                val today = clock.now().atZone(ZoneId.of(team.timeZone)).toLocalDate()
                listOf(
                        "activity.manage",
                        "invitation.manage",
                        "attendance.manage",
                        "roster.manage",
                        "assistant.memory.manage",
                    )
                    .any { teams.allowed(actor.subject, team.organizationId, team.id, it, today) }
            }
            .map { AssistantTeam(it.id, it.organizationId, it.name) }
    }

    @Transactional(readOnly = true)
    fun team(actor: Actor, id: UUID): AssistantTeamData {
        sessions.requireActive(actor)
        val team = teams.team(id) ?: throw NoSuchElementException()
        val today = clock.now().atZone(ZoneId.of(team.timeZone)).toLocalDate()
        val authorized =
            listOf(
                    "activity.manage",
                    "invitation.manage",
                    "attendance.manage",
                    "roster.manage",
                    "assistant.memory.manage",
                )
                .any { teams.allowed(actor.subject, team.organizationId, id, it, today) }
        if (!authorized && overview.overview(actor).teams.none { it.id == id })
            throw AccessDeniedException("Team access required")
        val canRoster =
            teams.allowed(actor.subject, team.organizationId, id, "roster.manage", today)
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
        return jdbc
            .sql(
                """select i.id,i.person_id,p.display_name as name,i.response,i.response_comment,i.revision
            from forena.invitation i join forena.person p on p.id=i.person_id and p.organization_id=i.organization_id
            where i.activity_id=:activity order by p.display_name,i.id"""
            )
            .param("activity", id)
            .query(AssistantInvitation::class.java)
            .list()
            .map { requireNotNull(it) }
            .filter { all || it.personId in own }
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
            else
                jdbc
                    .sql(
                        """select a.id as activity_id,a.title,a.starts_at,
            p.id as person_id,p.display_name as name,d.name as duty,dp.completed from forena.activity a
            join forena.activity_duty d on d.activity_id=a.id join forena.activity_duty_place dp on dp.duty_id=d.id
            join forena.person p on p.id=dp.person_id and p.organization_id=a.organization_id
            where a.team_id=:team and a.deleted_at is null and a.starts_at>=:start and a.starts_at<:end
            order by a.starts_at,a.id,p.id limit 201"""
                    )
                    .param("team", team)
                    .param("start", java.sql.Timestamp.from(start))
                    .param("end", java.sql.Timestamp.from(end))
                    .query(DutyHistory::class.java)
                    .list()
                    .map { requireNotNull(it) }
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
        val rows =
            jdbc
                .sql(
                    """select a.id as activity_id,a.title,a.starts_at,p.id as person_id,p.display_name as name,ap.present,coalesce(t.system_category,'other') as category
            from forena.activity a left join forena.activity_type t on t.id=a.activity_type_id join forena.attendance_record ap on ap.activity_id=a.id
            join forena.person p on p.id=ap.person_id and p.organization_id=a.organization_id
            where a.team_id=:team and a.deleted_at is null and a.starts_at>=:start and a.starts_at<:end
            order by a.starts_at,a.id,p.id limit 201"""
                )
                .param("team", team)
                .param("start", java.sql.Timestamp.from(start))
                .param("end", java.sql.Timestamp.from(end))
                .query(HistoryPerson::class.java)
                .list()
                .map { requireNotNull(it) }
        val count =
            jdbc
                .sql(
                    """select count(*) from forena.activity a join forena.attendance_record ap on ap.activity_id=a.id
            where a.team_id=:team and a.deleted_at is null and a.starts_at>=:start and a.starts_at<:end and ap.present"""
                )
                .param("team", team)
                .param("start", java.sql.Timestamp.from(start))
                .param("end", java.sql.Timestamp.from(end))
                .query(Long::class.java)
                .single()
        val people =
            jdbc
                .sql(
                    """select count(distinct ap.person_id) from forena.activity a join forena.attendance_record ap on ap.activity_id=a.id
            where a.team_id=:team and a.deleted_at is null and a.starts_at>=:start and a.starts_at<:end and ap.present"""
                )
                .param("team", team)
                .param("start", java.sql.Timestamp.from(start))
                .param("end", java.sql.Timestamp.from(end))
                .query(Long::class.java)
                .single()
        val summaries =
            jdbc
                .sql(
                    """select coalesce(t.system_category,'other') as category,
            count(distinct ap.person_id) as unique_people,count(*) as participation_count from forena.activity a
            left join forena.activity_type t on t.id=a.activity_type_id join forena.attendance_record ap on ap.activity_id=a.id
            where a.team_id=:team and a.deleted_at is null and a.starts_at>=:start and a.starts_at<:end and ap.present
            group by t.system_category order by category"""
                )
                .param("team", team)
                .param("start", java.sql.Timestamp.from(start))
                .param("end", java.sql.Timestamp.from(end))
                .query(HistorySummary::class.java)
                .list()
                .map { requireNotNull(it) }
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
        check(
            !jdbc
                .sql(
                    "select exists(select 1 from forena.activity_schedule where activity_id=:id and kind='reminder' and state='pending')"
                )
                .param("id", id)
                .query(Boolean::class.java)
                .single()
        )
        jdbc
            .sql(
                """insert into forena.activity_schedule(id,activity_id,organization_id,kind,due_at,audience_roles,person_ids)
            values(:id,:activity,:org,'reminder',:now,'',:people)"""
            )
            .param("id", UUID.randomUUID())
            .param("activity", id)
            .param("org", current.organizationId)
            .param("now", java.sql.Timestamp.from(now))
            .param("people", pending.joinToString(",") { it.personId.toString() })
            .update()
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

data class InvitationChannelState(
    val invitationId: UUID,
    val personId: UUID,
    val personName: String,
    val activityId: UUID,
    val activityRevision: Long,
    val invitationRevision: Long,
    val response: String,
    val organizationId: UUID,
    val teamId: UUID,
)
