package se.forena.api.activities.internal

import java.time.Instant
import org.springframework.data.jdbc.repository.query.Query
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
