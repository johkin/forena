package se.forena.api.activities

import java.util.UUID
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import se.forena.api.identity.*

data class AssistantMember(
    val personId: UUID,
    val name: String,
    val teamId: UUID,
    val teamName: String,
    val role: String,
    val responsibility: String?,
)

data class AssistantMembers(
    val uniquePeople: Long,
    val assignments: List<AssistantMember>,
    val truncated: Boolean,
)

@Service
class AssistantMemberService(
    private val jdbc: JdbcClient,
    private val sessions: SessionService,
    private val management: ActivityManagementService,
) {
    @Transactional(readOnly = true)
    fun read(actor: Actor, organization: UUID, team: UUID?, section: UUID?): AssistantMembers? {
        sessions.requireActive(actor)
        val clubAdmin =
            jdbc
                .sql(
                    "select exists(select 1 from forena.organization_member where organization_id=:org and subject=:actor and active and role in ('owner','admin'))"
                )
                .param("org", organization)
                .param("actor", actor.subject)
                .query(Boolean::class.java)
                .single()
        val sectionAdmin =
            section != null &&
                jdbc
                    .sql(
                        "select exists(select 1 from forena.section_administrator where organization_id=:org and section_id=:section and subject=:actor and active)"
                    )
                    .param("org", organization)
                    .param("section", section)
                    .param("actor", actor.subject)
                    .query(Boolean::class.java)
                    .single()
        if (
            !clubAdmin &&
                !sectionAdmin &&
                (team == null || !management.canManageRoster(actor, team))
        )
            return null
        // No contacts, account addresses or personal identifiers beyond the authorized roster.
        val rows =
            jdbc
                .sql(
                    """select p.id as person_id,p.display_name as name,t.id as team_id,t.name as team_name,m.role,g.name as responsibility
            from forena.team_membership m join forena.team t on t.id=m.team_id and t.organization_id=m.organization_id
            join forena.person p on p.id=m.person_id and p.organization_id=m.organization_id
            join forena.organization o on o.id=m.organization_id
            left join forena.team_audience_member am on am.person_id=m.person_id and am.organization_id=m.organization_id and am.active
            left join forena.team_audience_group g on g.id=am.group_id and g.team_id=t.id and g.kind='responsibility'
            where m.organization_id=:org and m.active and (:allTeams or m.team_id=:team) and (:allSections or t.section_id=:section)
            and m.starts_on<=(clock_timestamp() at time zone o.time_zone)::date
            and (m.ends_on is null or m.ends_on>=(clock_timestamp() at time zone o.time_zone)::date)
            order by p.display_name,p.id,t.id,g.id limit 201"""
                )
                .param("org", organization)
                .param("team", team)
                .param("allTeams", team == null)
                .param("section", section)
                .param("allSections", section == null)
                .query(AssistantMember::class.java)
                .list()
                .map { requireNotNull(it) }
        val total =
            jdbc
                .sql(
                    """select count(distinct m.person_id) from forena.team_membership m
            join forena.team t on t.id=m.team_id and t.organization_id=m.organization_id
            join forena.organization o on o.id=m.organization_id
            where m.organization_id=:org and m.active and (:allTeams or m.team_id=:team) and (:allSections or t.section_id=:section)
            and m.starts_on<=(clock_timestamp() at time zone o.time_zone)::date
            and (m.ends_on is null or m.ends_on>=(clock_timestamp() at time zone o.time_zone)::date)"""
                )
                .param("org", organization)
                .param("team", team)
                .param("allTeams", team == null)
                .param("section", section)
                .param("allSections", section == null)
                .query(Long::class.java)
                .single()
        return AssistantMembers(total, rows.take(200), rows.size > 200)
    }
}
