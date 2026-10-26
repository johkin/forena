package se.forena.api.activities.internal

import se.forena.api.activities.AttendancePerson
import se.forena.api.activities.InvitationNotificationSnapshot

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
    fun existsByActivityId(activityId: UUID): Boolean

    @Modifying
    @Query("insert into forena.invitation(id,organization_id,activity_id,person_id) values(:id,:organization,:activity,:person) on conflict (activity_id,person_id) do nothing")
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
    (:hasManagedTeams and a.team_id in (:managedTeams))
    or exists (select 1 from forena.invitation i where :hasPeople and i.activity_id = a.id
        and i.organization_id = a.organization_id and i.person_id in (:people))
    or exists (select 1 from forena.team_membership m where :hasPeople and m.team_id = a.team_id
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
        where a.deleted_at is null and a.status in ('scheduled','cancelled') and a.starts_at < :until and a.ends_at > :from
        and (""" + PERSONAL_SCOPE + """) order by a.starts_at, a.id limit 20001""")
    fun findMonth(people: Collection<UUID>, ownPeople: Collection<UUID>, hasOwnPeople: Boolean, hasPeople: Boolean,
        managedTeams: Collection<UUID>, hasManagedTeams: Boolean, from: Instant, until: Instant): List<PersonalActivityRow>

    @Query("""select r.activity_id,p.id as person_id,
        exists(select 1 from forena.attendance_record x where x.activity_id=r.activity_id and x.person_id=p.id) as present
        from forena.attendance_report r join forena.person p on p.organization_id=r.organization_id
        where r.activity_id in (:activities) and p.id in (:people)""")
    fun attendance(activities: Collection<UUID>, people: Collection<UUID>): List<PersonalAttendanceRow>

    @Query("""select a.* from forena.activity a join forena.organization o on o.id = a.organization_id
        where a.deleted_at is null and a.status = 'scheduled' and a.ends_at > :now and (""" + PERSONAL_SCOPE + """)
        order by a.starts_at, a.id limit 20001""")
    fun findUpcoming(people: Collection<UUID>, ownPeople: Collection<UUID>, hasOwnPeople: Boolean, hasPeople: Boolean, managedTeams: Collection<UUID>, hasManagedTeams: Boolean, now: Instant): List<PersonalActivityRow>

    @Query("""select a.* from forena.activity a join forena.organization o on o.id = a.organization_id
        where a.deleted_at is null and a.id = :id and (""" + PERSONAL_SCOPE + ")")
    fun findAccessible(id: UUID, people: Collection<UUID>, ownPeople: Collection<UUID>, hasOwnPeople: Boolean, hasPeople: Boolean, managedTeams: Collection<UUID>, hasManagedTeams: Boolean): PersonalActivityRow?
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
        where t.organization_id in (
            select organization_id from forena.organization_member where subject=:subject and active and role in ('owner','admin')
            union select p.organization_id from forena.team_permission_assignment p
                join forena.person_access a on a.person_id=p.person_id and a.organization_id=p.organization_id
                where a.subject=:subject and a.active and a.kind='self' and p.active and p.permission='activity.manage'
            union select organization_id from forena.team_administrator where subject=:subject and active
            union select organization_id from forena.section_administrator where subject=:subject and active)
        order by t.name""")
    fun teams(subject: UUID): List<ManagementTeamRow>

    @Query("""select t.id,t.organization_id,t.name,o.name as organization_name,o.time_zone,s.discipline_key,t.section_id
        from forena.team t join forena.organization o on o.id=t.organization_id
        left join forena.section s on s.id=t.section_id and s.organization_id=t.organization_id
        where t.id=:team""")
    fun team(team: UUID): ManagementTeamRow?

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

data class ScheduledInvitationRow(
    val id: UUID,
    val activityId: UUID,
    val organizationId: UUID,
    val kind: String,
    val audienceRoles: String,
    val personIds: String,
    val groupIds: String,
    val responsibilityTypeIds: String,
)

data class InvitationAudienceRow(val id: UUID, val displayName: String)

data class InvitationMessageContext(
    val organizationName: String,
    val teamName: String,
    val timeZone: String,
)

interface ScheduledInvitationRepository : Repository<ActivityScheduleEntity, UUID> {
    @Query(
        """
        select id from forena.activity_schedule
        where state = 'pending' and due_at <= :now and next_attempt <= :now
        order by next_attempt, due_at, id limit 20
    """
    )
    fun due(now: Instant): List<UUID>

    // Lock the activity before the schedule, matching edits, cancellation and invitation answers.
    @Query(
        """
        select a.id from forena.activity a
        join forena.activity_schedule s on s.activity_id = a.id
        where s.id = :schedule
        for update of a skip locked
    """
    )
    fun lockActivity(schedule: UUID): UUID?

    @Query(
        """
        select * from forena.activity_schedule
        where id = :id and state = 'pending' and due_at <= :now and next_attempt <= :now
        for update skip locked
    """
    )
    fun lockDue(id: UUID, now: Instant): ScheduledInvitationRow?

    @Query(
        """
        select o.name as organization_name, t.name as team_name, o.time_zone
        from forena.organization o join forena.team t on t.organization_id = o.id
        where t.id = :team
    """
    )
    fun context(team: UUID): InvitationMessageContext

    @Query(
        """
        select distinct p.id, p.display_name
        from forena.team_membership m
        join forena.person p on p.id = m.person_id and p.organization_id = m.organization_id
        where m.team_id = :team and m.organization_id = :organization and m.active
          and m.starts_on <= :day and (m.ends_on is null or m.ends_on >= :day)
          and ((:hasPeople and p.id in (:people)) or (:hasRoles and m.role in (:roles)) or (:hasGroups and exists (
            select 1 from forena.team_audience_member am
            join forena.team_audience_group g on g.id = am.group_id and g.organization_id = am.organization_id
            where am.person_id = p.id and am.organization_id = p.organization_id and am.active
              and g.team_id = m.team_id and g.id in (:groups))))
        order by p.id limit 1001
    """
    )
    fun audience(
        team: UUID,
        organization: UUID,
        day: java.time.LocalDate,
        people: Collection<UUID>,
        roles: Collection<String>,
        groups: Collection<UUID>,
        hasPeople: Boolean,
        hasRoles: Boolean,
        hasGroups: Boolean,
    ): List<InvitationAudienceRow>

    @Modifying
    @Query(
        """
        update forena.activity_schedule
        set state = :state, completed_at = :now, last_error = null where id = :id
    """
    )
    fun finish(id: UUID, state: String, now: Instant)

    @Modifying
    @Query(
        """
        update forena.activity_schedule
        set attempts = attempts + 1,
            state = case when attempts >= 4 then 'failed' else 'pending' end,
            next_attempt = cast(:now as timestamptz) + interval '1 second' * (30 * power(2, least(attempts, 8))),
            last_error = 'materialization_failed'
        where id = :id and state = 'pending'
    """
    )
    fun fail(id: UUID, now: Instant)

    @Query(
        """
        insert into forena.invitation_notification(id, schedule_id, invitation_id, recipient_subject, decided_at, recipient, subject, body)
        values (:id, :schedule, :invitation, :recipient, :now, :email, :subject, :body)
        on conflict (schedule_id, invitation_id, recipient_subject) do nothing
        returning id
    """
    )
    fun checkpoint(
        id: UUID,
        schedule: UUID,
        invitation: UUID,
        recipient: UUID,
        now: Instant,
        email: String,
        subject: String,
        body: String,
    ): UUID?

    @Query("select id, recipient, subject, body from forena.invitation_notification where id = :id")
    fun notification(id: UUID): InvitationNotificationSnapshot?
}

/** Roster reads are scoped by the authorized team and its local date. */
interface RosterRepository : Repository<TeamEntity, UUID> {
    @Query("""select p.id,p.display_name,m.role from forena.team_membership m
        join forena.person p on p.id=m.person_id and p.organization_id=m.organization_id
        where m.team_id=:team and m.active and m.starts_on<=:today and (m.ends_on is null or m.ends_on>=:today)
        order by p.display_name,p.id,m.role""")
    fun members(team: UUID, today: java.time.LocalDate): List<ManagementPersonRow>

    @Modifying
    @Query("insert into forena.team_audience_group(id,organization_id,team_id,name,kind) values(:id,:organization,:team,:name,'group')")
    fun createGroup(id: UUID, organization: UUID, team: UUID, name: String): Int

    @Modifying
    @Query("""update forena.team_audience_group set name=:name,revision=revision+1
        where id=:id and team_id=:team and kind='group' and revision=:revision""")
    fun updateGroup(id: UUID, team: UUID, name: String, revision: Long): Int

    @Modifying
    @Query("delete from forena.team_audience_member where group_id=:group")
    fun clearGroup(group: UUID): Int

    @Modifying
    @Query("insert into forena.team_audience_member(group_id,organization_id,person_id) values(:group,:organization,:person)")
    fun addMember(group: UUID, organization: UUID, person: UUID): Int

    @Modifying
    @Query("delete from forena.team_audience_group where id=:id and team_id=:team and kind='group' and revision=:revision")
    fun deleteGroup(id: UUID, team: UUID, revision: Long): Int

    @Modifying
    @Query("insert into forena.roster_audit(organization_id,team_id,actor_subject,operation,target_id) values(:organization,:team,:actor,:operation,:target)")
    fun audit(organization: UUID, team: UUID, actor: UUID, operation: String, target: UUID): Int
}

interface AttendanceRepository : Repository<ActivityEntity, UUID> {
    @Query("select time_zone from forena.organization where id=:organization")
    fun timeZone(organization: UUID): String

    @Query("select reported_at from forena.attendance_report where activity_id=:activity")
    fun reportedAt(activity: UUID): Instant?

    @Query("""select p.id as person_id,p.display_name,
        coalesce((select case when m.role='leader' then 'leader' else 'participant' end from forena.team_membership m where m.team_id=:team and m.person_id=p.id and m.active
            and m.starts_on<=:date and (m.ends_on is null or m.ends_on>=:date) order by m.role limit 1),'participant') as role,
        i.response,exists(select 1 from forena.attendance_record r where r.activity_id=:activity and r.person_id=p.id) as present
        from forena.person p left join forena.invitation i on i.person_id=p.id and i.activity_id=:activity
        where p.organization_id=:organization and (i.id is not null or exists(select 1 from forena.team_membership m
            where m.team_id=:team and m.person_id=p.id and m.active and m.starts_on<=:date and (m.ends_on is null or m.ends_on>=:date)))
        order by p.display_name,p.id""")
    fun roster(activity: UUID, team: UUID, organization: UUID, date: java.time.LocalDate): List<AttendancePerson>

    @Modifying
    @Query("""insert into forena.attendance_report(activity_id,organization_id,reported_by,reported_at) values(:activity,:organization,:actor,:now)
        on conflict(activity_id) do update set reported_by=:actor,reported_at=:now""")
    fun report(activity: UUID, organization: UUID, actor: UUID, now: Instant): Int

    @Modifying @Query("delete from forena.attendance_record where activity_id=:activity")
    fun clear(activity: UUID): Int

    @Modifying @Query("insert into forena.attendance_record(activity_id,organization_id,person_id) values(:activity,:organization,:person)")
    fun present(activity: UUID, organization: UUID, person: UUID): Int
}
