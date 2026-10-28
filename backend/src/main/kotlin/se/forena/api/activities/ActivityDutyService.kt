package se.forena.api.activities

import java.time.Instant
import java.util.UUID
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.access.AccessDeniedException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import se.forena.api.activities.internal.ManagedActivityRepository
import se.forena.api.identity.Actor
import se.forena.api.identity.SessionService

data class ActivityDutyCommand(
    val teamId: UUID,
    val activityIds: List<UUID>,
    val name: String,
    val places: Int,
    val instructions: String = "",
)

data class DutyTarget(
    val id: UUID,
    val title: String,
    val startsAt: Instant,
    val endsAt: Instant,
    val revision: Long,
    val category: String,
    val sourceKind: String,
    val seriesId: UUID?,
    val externalSource: String?,
    val venue: String?,
    val exists: Boolean,
)

data class DutyTargets(val activities: List<DutyTarget>, val truncated: Boolean)

@Service
class ActivityDutyService(
    private val jdbc: JdbcClient,
    private val management: ActivityManagementService,
    private val activities: ManagedActivityRepository,
    private val sessions: SessionService,
) {
    @Transactional(readOnly = true)
    fun targets(actor: Actor, team: UUID): DutyTargets {
        authorize(actor, team)
        val rows = rows(team, "")
        return DutyTargets(rows.take(200), rows.size > 200)
    }

    @Transactional(readOnly = true)
    fun preview(actor: Actor, command: ActivityDutyCommand): List<DutyTarget> {
        authorize(actor, command.teamId)
        require(
            command.activityIds.size in 1..100 &&
                command.activityIds.distinct().size == command.activityIds.size
        )
        require(
            command.name.trim().length in 1..80 &&
                command.instructions.length <= 2000 &&
                command.places in 1..50
        )
        val selected =
            command.activityIds.map { id ->
                activities.findById(id).orElseThrow { NoSuchElementException() }
            }
        require(
            selected.all {
                it.teamId == command.teamId &&
                    it.deletedAt == null &&
                    it.status == "scheduled" &&
                    it.startsAt > Instant.now()
            }
        )
        return selected.map { activity ->
            jdbc
                .sql(
                    """select a.id,a.title,a.starts_at,a.ends_at,a.revision,coalesce(t.system_category,'other') as category,
                a.source_kind,a.series_id,a.external_source,a.venue,
                exists(select 1 from forena.activity_duty d where d.activity_id=a.id and lower(d.name)=lower(:name)) as exists
                from forena.activity a left join forena.activity_type t on t.id=a.activity_type_id where a.id=:id"""
                )
                .param("name", command.name.trim())
                .param("id", activity.activityId)
                .query(DutyTarget::class.java)
                .single()
        }
    }

    @Transactional
    fun save(actor: Actor, command: ActivityDutyCommand) {
        preview(actor, command)
        command.activityIds.sorted().forEach {
            check(activities.findLockedByActivityId(it) != null)
        }
        val rows = preview(actor, command)
        rows
            .filter { !it.exists }
            .forEach { activity ->
                val id = UUID.randomUUID()
                val organization =
                    activities
                        .findById(activity.id)
                        .orElseThrow { NoSuchElementException() }
                        .organizationId
                jdbc
                    .sql(
                        "insert into forena.activity_duty(id,activity_id,organization_id,name,instructions,starts_at,ends_at,created_by) values(:id,:activity,:org,:name,:instructions,:start,:end,:actor)"
                    )
                    .param("id", id)
                    .param("activity", activity.id)
                    .param("org", organization)
                    .param("name", command.name.trim())
                    .param("instructions", command.instructions)
                    .param("start", java.sql.Timestamp.from(activity.startsAt))
                    .param("end", java.sql.Timestamp.from(activity.endsAt))
                    .param("actor", actor.subject)
                    .update()
                for (number in 1..command.places) jdbc
                    .sql(
                        "insert into forena.activity_duty_place(id,duty_id,number) values(:id,:duty,:number)"
                    )
                    .param("id", UUID.randomUUID())
                    .param("duty", id)
                    .param("number", number)
                    .update()
                jdbc
                    .sql(
                        "insert into forena.activity_duty_audit(duty_id,actor_subject,operation) values(:id,:actor,'created')"
                    )
                    .param("id", id)
                    .param("actor", actor.subject)
                    .update()
            }
    }

    private fun authorize(actor: Actor, team: UUID) {
        sessions.requireActive(actor)
        if (!management.canManageInvitations(actor, team))
            throw AccessDeniedException("Duty permission required")
    }

    private fun rows(team: UUID, name: String): List<DutyTarget> =
        jdbc
            .sql(
                """select a.id,a.title,a.starts_at,a.ends_at,a.revision,
        coalesce(t.system_category,'other') as category,a.source_kind,a.series_id,a.external_source,a.venue,
        exists(select 1 from forena.activity_duty d where d.activity_id=a.id and lower(d.name)=lower(:name)) as exists
        from forena.activity a left join forena.activity_type t on t.id=a.activity_type_id
        where a.team_id=:team and a.deleted_at is null and a.status='scheduled' and a.starts_at>clock_timestamp()
        order by a.starts_at,a.id limit 201"""
            )
            .param("team", team)
            .param("name", name)
            .query(DutyTarget::class.java)
            .list()
            .map { requireNotNull(it) }
}
