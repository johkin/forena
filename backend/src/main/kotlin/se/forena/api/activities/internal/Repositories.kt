package se.forena.api.activities.internal

import java.time.Instant
import org.springframework.data.jdbc.repository.query.Query
import org.springframework.data.jdbc.repository.query.Modifying
import java.util.Optional
import java.util.UUID
import org.springframework.data.relational.core.sql.LockMode
import org.springframework.data.relational.repository.Lock
import org.springframework.data.repository.Repository

interface ActivityRepository : Repository<ActivityEntity, UUID> {
    fun findById(id: UUID): Optional<ActivityEntity>

    @Lock(LockMode.PESSIMISTIC_WRITE)
    fun findLockedByIdAndOrganizationId(id: UUID, organizationId: UUID): ActivityEntity?
}

interface InvitationRepository : Repository<InvitationEntity, UUID> {
    @Modifying
    @Query("insert into forena.invitation(id,organization_id,activity_id,person_id) values(:id,:organization,:activity,:person)")
    fun create(id: UUID, organization: UUID, activity: UUID, person: UUID): Int

    fun findByActivityIdInAndPersonIdIn(activityIds: Collection<UUID>, personIds: Collection<UUID>): List<InvitationEntity>

    fun findByActivityIdAndPersonIdIn(activityId: UUID, personIds: Collection<UUID>): List<InvitationEntity>

    /** One bounded batch for the current overview page; never expose future invitations. */
    @Query("""
        select i.* from forena.invitation i
        join forena.activity a on a.id = i.activity_id and a.organization_id = i.organization_id
        where i.activity_id in (:activities) and i.person_id in (:people)
          and (a.invitation_send_at is null or a.invitation_send_at <= :now)
    """)
    fun findSentForActivities(activities: Collection<UUID>, people: Collection<UUID>, now: Instant): List<InvitationEntity>

    @Lock(LockMode.PESSIMISTIC_WRITE)
    fun findLockedByIdAndOrganizationIdAndActivityIdAndPersonId(id: UUID, organizationId: UUID, activityId: UUID, personId: UUID): InvitationEntity?

    fun findById(id: UUID): Optional<InvitationEntity>

    fun save(invitation: InvitationEntity): InvitationEntity
}

interface InvitationHistoryRepository : Repository<InvitationHistoryEntity, UUID> {
    fun save(history: InvitationHistoryEntity): InvitationHistoryEntity
}

interface ActivitySignalRepository : Repository<ActivitySignalEntity, UUID> {
    fun findById(id: UUID): Optional<ActivitySignalEntity>
    fun save(signal: ActivitySignalEntity): ActivitySignalEntity
}

interface ActivityOverviewRepository : Repository<ActivityEntity, UUID> {
    @Query("""
        select a.id, a.title, a.starts_at, a.ends_at,
               o.name as organization_name, t.name as team_name
        from forena.activity a
        join forena.organization o on o.id = a.organization_id
        join forena.team t on t.id = a.team_id and t.organization_id = a.organization_id
        where a.status = 'scheduled' and a.ends_at > :now and a.starts_at < :until
          and exists (select 1 from forena.invitation i
                      where i.activity_id = a.id and i.organization_id = a.organization_id
                        and i.person_id in (:people))
        order by a.starts_at, a.id
        limit 51 offset :offset
    """)
    fun findUpcoming(people: Collection<UUID>, now: Instant, until: Instant, offset: Int): List<ActivityOverviewRow>
}

interface OrganizationRepository : Repository<OrganizationEntity, UUID> {
    fun findByIdInOrderByNameAsc(ids: Collection<UUID>): List<OrganizationEntity>
}
interface TeamRepository : Repository<TeamEntity, UUID> {
    fun findByIdInOrderByNameAsc(ids: Collection<UUID>): List<TeamEntity>
}
interface TeamMembershipRepository : Repository<TeamMembershipEntity, UUID> {
    fun findByPersonIdInAndActiveTrue(people: Collection<UUID>): List<TeamMembershipEntity>
}
interface TeamAccessAssignmentRepository : Repository<TeamAccessAssignmentEntity, UUID> {
    fun findByPersonIdInAndActiveTrue(people: Collection<UUID>): List<TeamAccessAssignmentEntity>
}
interface OrganizationMemberRepository : Repository<OrganizationMemberEntity, UUID> {
    fun findBySubjectAndActiveTrue(subject: UUID): List<OrganizationMemberEntity>
}

// Membership/access only widens activity reads, never invitation response rights.
private const val PERSONAL_SCOPE = """
    exists (select 1 from forena.invitation i where i.activity_id = a.id
        and i.organization_id = a.organization_id and i.person_id in (:people))
    or exists (select 1 from forena.team_membership m where m.team_id = a.team_id
        and m.organization_id = a.organization_id and m.person_id in (:people) and m.active
        and m.starts_on <= (a.starts_at at time zone o.time_zone)::date
        and (m.ends_on is null or m.ends_on >= (a.starts_at at time zone o.time_zone)::date))
    or exists (select 1 from forena.team_access_assignment x where x.team_id = a.team_id
        and x.organization_id = a.organization_id and :hasOwnPeople and x.person_id in (:ownPeople) and x.active
        and x.starts_on <= (a.starts_at at time zone o.time_zone)::date
        and (x.ends_on is null or x.ends_on >= (a.starts_at at time zone o.time_zone)::date))
"""

interface PersonalActivityRepository : Repository<ActivityEntity, UUID> {
    @Query("""select a.* from forena.activity a join forena.organization o on o.id = a.organization_id
        where a.status = 'scheduled' and a.ends_at > :now and (""" + PERSONAL_SCOPE + """)
        order by a.starts_at, a.id limit 20001""")
    fun findUpcoming(people: Collection<UUID>, ownPeople: Collection<UUID>, hasOwnPeople: Boolean, now: Instant): List<PersonalActivityRow>

    @Query("""select a.* from forena.activity a join forena.organization o on o.id = a.organization_id
        where a.id = :id and (""" + PERSONAL_SCOPE + ")")
    fun findAccessible(id: UUID, people: Collection<UUID>, ownPeople: Collection<UUID>, hasOwnPeople: Boolean): PersonalActivityRow?
}

interface ManagedActivityRepository : Repository<ManagedActivityEntity, UUID> {
    fun findById(id: UUID): Optional<ManagedActivityEntity>
    fun findByTeamIdOrderByStartsAtAsc(team: UUID): List<ManagedActivityEntity>
    @Lock(LockMode.PESSIMISTIC_WRITE)
    fun findLockedByActivityId(id: UUID): ManagedActivityEntity?
    fun save(entity: ManagedActivityEntity): ManagedActivityEntity
}
interface ActivityTypeRepository : Repository<ActivityTypeEntity, UUID> {
    @Query("select * from forena.activity_type where organization_id is null or organization_id=:organization order by name")
    fun catalogue(organization: UUID): List<ActivityTypeEntity>
}
interface ActivityAuditRepository : Repository<ActivityAuditEntity, UUID> {
    fun save(entity: ActivityAuditEntity): ActivityAuditEntity
}
interface ActivityScheduleRepository : Repository<ActivityScheduleEntity, UUID> {
    fun save(entity: ActivityScheduleEntity): ActivityScheduleEntity
    fun findByActivityId(id: UUID): List<ActivityScheduleEntity>
}
interface ManagementRepository : Repository<TeamEntity, UUID> {
    @Query("""select t.id,t.organization_id,t.name,o.name as organization_name,o.time_zone,s.discipline_key,t.section_id
        from forena.team t join forena.organization o on o.id=t.organization_id
        left join forena.section s on s.id=t.section_id and s.organization_id=t.organization_id
        order by t.name""")
    fun teams(): List<ManagementTeamRow>

    @Query("select id from forena.team where id=:team for update")
    fun lockTeam(team: UUID): UUID?

    @Query("""select exists(select 1 from forena.organization_member m
        where m.organization_id=:organization and m.subject=:subject and m.active and m.role in ('owner','admin'))
        or exists(select 1 from forena.team_permission_assignment p
            join forena.person_access a on a.person_id=p.person_id and a.organization_id=p.organization_id
            where p.team_id=:team and p.organization_id=:organization and p.permission=:permission
              and p.active and p.starts_on<=:today and (p.ends_on is null or p.ends_on>=:today)
              and a.subject=:subject and a.active and a.kind='self')
        or exists(select 1 from forena.team_administrator t
            join forena.person_access a on a.person_id=t.person_id and a.organization_id=t.organization_id
            where t.team_id=:team and t.organization_id=:organization and t.subject=:subject
              and t.active and t.starts_on<=:today and (t.ends_on is null or t.ends_on>=:today)
              and a.subject=:subject and a.active and a.kind='self')
        or exists(select 1 from forena.section_administrator s join forena.team t on t.section_id=s.section_id and t.organization_id=s.organization_id
            where t.id=:team and s.organization_id=:organization and s.subject=:subject and s.active)
        """)
    fun allowed(subject: UUID, organization: UUID, team: UUID, permission: String, today: java.time.LocalDate): Boolean

    @Query("""select distinct p.id,p.display_name,m.role from forena.team_membership m
        join forena.person p on p.id=m.person_id and p.organization_id=m.organization_id
        where m.team_id=:team and m.active and m.role in ('leader','participant')
        and m.starts_on<=:today and (m.ends_on is null or m.ends_on>=:today)
        order by p.display_name,p.id""")
    fun participants(team: UUID, today: java.time.LocalDate): List<ManagementPersonRow>
}

interface ActivityDefaultsRepository : Repository<ActivityDefaultsEntity, UUID> {
    @Query("""select * from forena.activity_defaults where organization_id=:organization
        and (team_id=:team or section_id=:section) and discipline_key=:discipline""")
    fun defaults(organization: UUID, team: UUID, section: UUID?, discipline: String): List<ActivityDefaultsEntity>
}
interface AudienceGroupRepository : Repository<AudienceGroupEntity, UUID> {
    fun findByTeamId(team: UUID): List<AudienceGroupEntity>
}
interface AudienceMemberRepository : Repository<AudienceMemberEntity, UUID> {
    fun findByGroupIdInAndActiveTrue(groups: Collection<UUID>): List<AudienceMemberEntity>
}
