package se.forena.api.identity

import java.util.UUID
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

data class AssistantOrganization(val id: UUID, val name: String, val timeZone: String)

data class AssistantTeam(val id: UUID, val organizationId: UUID, val name: String)

data class AssistantViewer(val roles: List<String>, val ageGroup: String)

@Service
class AssistantIdentityService(private val jdbc: JdbcClient, private val sessions: SessionService) {
    @Transactional(readOnly = true)
    fun organizations(actor: Actor): List<AssistantOrganization> {
        sessions.requireActive(actor)
        return jdbc
            .sql(
                """select o.id,o.name,o.time_zone from forena.organization o where
            exists(select 1 from forena.person_access a where a.organization_id=o.id and a.subject=:subject and a.active)
            or exists(select 1 from forena.organization_member m where m.organization_id=o.id and m.subject=:subject and m.active)
            or exists(select 1 from forena.section_administrator s where s.organization_id=o.id and s.subject=:subject and s.active)
            or exists(select 1 from forena.team_permission_assignment p join forena.person_access a
                on a.person_id=p.person_id and a.organization_id=p.organization_id and a.kind='self' and a.active
                where a.subject=:subject and p.organization_id=o.id and p.active
                and p.starts_on<=(clock_timestamp() at time zone o.time_zone)::date
                and (p.ends_on is null or p.ends_on>=(clock_timestamp() at time zone o.time_zone)::date))
            order by o.name,o.id"""
            )
            .param("subject", actor.subject)
            .query(AssistantOrganization::class.java)
            .list()
            .map { requireNotNull(it) }
    }

    @Transactional(readOnly = true)
    fun viewer(actor: Actor, org: UUID?, team: UUID?): AssistantViewer {
        sessions.requireActive(actor)
        val ages =
            jdbc
                .sql(
                    """select distinct extract(year from age((clock_timestamp() at time zone o.time_zone)::date,p.birth_date))::int
            from forena.person p join forena.person_access a on a.person_id=p.id and a.organization_id=p.organization_id
            join forena.organization o on o.id=p.organization_id
            where a.subject=:subject and a.kind='self' and a.active and p.birth_date is not null
            and (:allOrganizations or p.organization_id=:org)"""
                )
                .param("subject", actor.subject)
                .param("allOrganizations", org == null)
                .param("org", org)
                .query(Int::class.java)
                .list()
                .map { requireNotNull(it) }
                .distinct()
        val age = ages.singleOrNull()
        val roles =
            jdbc
                .sql(
                    """select distinct m.role from forena.team_membership m join forena.person_access a
            on a.person_id=m.person_id and a.organization_id=m.organization_id and a.active and a.kind='self'
            join forena.organization o on o.id=m.organization_id
            where a.subject=:subject and m.active and (:allTeams or m.team_id=:team)
            and (:allOrganizations or m.organization_id=:org)
            and m.starts_on<=(clock_timestamp() at time zone o.time_zone)::date
            and (m.ends_on is null or m.ends_on>=(clock_timestamp() at time zone o.time_zone)::date)"""
                )
                .param("subject", actor.subject)
                .param("team", team)
                .param("allTeams", team == null)
                .param("org", org)
                .param("allOrganizations", org == null)
                .query(String::class.java)
                .list()
                .map { requireNotNull(it) }
                .toMutableList()
        val guardian =
            jdbc
                .sql(
                    "select exists(select 1 from forena.person_access where subject=:subject and active and kind='guardian' and (:allOrganizations or organization_id=:org))"
                )
                .param("subject", actor.subject)
                .param("allOrganizations", org == null)
                .param("org", org)
                .query(Boolean::class.java)
                .single()
        if (guardian) roles.add("guardian")
        return AssistantViewer(
            roles.distinct(),
            when {
                age == null || age < 0 -> "unknown"
                age < 13 -> "under13"
                age < 18 -> "13to17"
                else -> "adult"
            },
        )
    }
}
