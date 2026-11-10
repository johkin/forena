package se.forena.api.activities.internal

import java.time.Instant
import java.time.LocalDate
import java.util.Optional
import java.util.UUID
import org.springframework.data.jdbc.repository.query.Modifying
import org.springframework.data.jdbc.repository.query.Query
import org.springframework.data.relational.core.sql.LockMode
import org.springframework.data.relational.repository.Lock
import org.springframework.data.repository.Repository
import se.forena.api.activities.*
import se.forena.api.activities.ActivityCapacity
import se.forena.api.activities.AttendancePerson
import se.forena.api.activities.CapabilityPlayerCounts
import se.forena.api.activities.DisciplinePlayer
import se.forena.api.activities.FollowUpActivity
import se.forena.api.activities.InvitationNotificationSnapshot
import se.forena.api.activities.TeamReportPeriod

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
    fun findByPersonIdIn(people: Collection<UUID>): List<TeamMembershipEntity>
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
    or exists (select 1 from forena.team_membership m where :hasOwnPeople and m.team_id=a.team_id
        and m.organization_id=a.organization_id and m.person_id in (:ownPeople) and m.active and m.role='leader'
        and m.starts_on<=(current_timestamp at time zone o.time_zone)::date
        and (m.ends_on is null or m.ends_on>=(current_timestamp at time zone o.time_zone)::date))
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

    @Query("""select activity_id,person_id,present from forena.attendance_record
        where activity_id in (:activities) and person_id in (:people)""")
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
/** Shared by scalar authorization and the per-command permission projection. */
private const val TEAM_PERMISSION_ACCESS = """
    exists(select 1 from forena.organization_member m
        where m.organization_id=:organization and m.subject=:subject and m.active and m.role in ('owner','admin'))
    or exists(select 1 from forena.team_permission_assignment p
        join forena.person_access a on a.person_id=p.person_id and a.organization_id=p.organization_id
        where p.team_id=:team and p.organization_id=:organization and p.permission=requested.permission
          and p.active and p.starts_on<=:today and (p.ends_on is null or p.ends_on>=:today)
          and a.subject=:subject and a.active and a.kind='self')
    or exists(select 1 from forena.team_administrator t
        join forena.person_access a on a.person_id=t.person_id and a.organization_id=t.organization_id
        where t.team_id=:team and t.organization_id=:organization and t.subject=:subject
          and t.active and t.starts_on<=:today and (t.ends_on is null or t.ends_on>=:today)
          and a.subject=:subject and a.active and a.kind='self')
    or exists(select 1 from forena.section_administrator s join forena.team t on t.section_id=s.section_id and t.organization_id=s.organization_id
        where t.id=:team and s.organization_id=:organization and s.subject=:subject and s.active)
"""

interface ManagementRepository : Repository<TeamEntity, UUID> {
    fun teams(subject: UUID): List<ManagementTeamRow> = teams(subject, TeamPermission.keys)

    @Query("""select t.id,t.organization_id,t.name,o.name as organization_name,o.time_zone,s.discipline_key,t.section_id
        from forena.team t join forena.organization o on o.id=t.organization_id
        left join forena.section s on s.id=t.section_id and s.organization_id=t.organization_id
        where t.organization_id in (
            select organization_id from forena.organization_member where subject=:subject and active and role in ('owner','admin')
            union select p.organization_id from forena.team_permission_assignment p
                join forena.person_access a on a.person_id=p.person_id and a.organization_id=p.organization_id
                where a.subject=:subject and a.active and a.kind='self' and p.active and p.permission in (:permissions)
            union select organization_id from forena.team_administrator where subject=:subject and active
            union select organization_id from forena.section_administrator where subject=:subject and active)
        order by t.name""")
    fun teams(subject: UUID, permissions: Collection<String>): List<ManagementTeamRow>

    @Query("""select t.id,t.organization_id,t.name,o.name as organization_name,o.time_zone,s.discipline_key,t.section_id
        from forena.team t join forena.organization o on o.id=t.organization_id
        left join forena.section s on s.id=t.section_id and s.organization_id=t.organization_id
        where t.id=:team""")
    fun team(team: UUID): ManagementTeamRow?

    @Query("select id from forena.team where id=:team for update")
    fun lockTeam(team: UUID): UUID?

    @Query("select exists(select 1 from (select cast(:permission as text) as permission) requested where " + TEAM_PERMISSION_ACCESS + ")")
    fun allowed(subject: UUID, organization: UUID, team: UUID, permission: String, today: LocalDate): Boolean

    @Query("select requested.permission from unnest(array[:permissions]::text[]) requested(permission) where " + TEAM_PERMISSION_ACCESS)
    fun permissions(subject: UUID, organization: UUID, team: UUID, permissions: Collection<String>, today: LocalDate): List<String>

    @Query("""select distinct p.id,p.display_name,m.role from forena.team_membership m
        join forena.person p on p.id=m.person_id and p.organization_id=m.organization_id
        where m.team_id=:team and m.active and m.role in ('leader','participant')
        and m.starts_on<=:today and (m.ends_on is null or m.ends_on>=:today)
        order by p.display_name,p.id""")
    fun participants(team: UUID, today: java.time.LocalDate): List<ManagementPersonRow>
}

interface ActivityDefaultsRepository : Repository<ActivityDefaultsEntity, UUID> {
    @Modifying @Query("""insert into forena.activity_defaults(id,organization_id,section_id,team_id,activity_type_id,discipline_key,version,values_json)
        values(:id,:organization,:section,:team,:type,:discipline,:version,:values)""")
    fun insert(id: UUID,organization: UUID,section: UUID?,team: UUID?,type: UUID,discipline: String,version: String,values: String)
    @Modifying @Query("update forena.activity_defaults set values_json=:values,revision=revision+1 where id=:id and revision=:revision")
    fun update(id: UUID,revision: Long,values: String): Int
    @Modifying @Query("insert into forena.activity_defaults_audit(id,defaults_id,actor_subject,revision) values(:id,:defaults,:actor,:revision)")
    fun audit(id: UUID,defaults: UUID,actor: UUID,revision: Long)
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
        insert into forena.invitation_notification(id, schedule_id, invitation_id, recipient_subject, decided_at, recipient, subject, body, activity_revision, invitation_revision)
        select :id, :schedule, :invitation, :recipient, :now, :email, :subject, :body, a.revision, i.revision
        from forena.invitation i join forena.activity a on a.id=i.activity_id where i.id=:invitation
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
    @Query("select revision,reported_at from forena.attendance_report where activity_id=:activity")
    fun report(activity: UUID): AttendanceReportRow?

    @Query("""select p.id as person_id,p.display_name,r.role,i.response,r.present
        from forena.attendance_record r join forena.person p on p.id=r.person_id
        left join forena.invitation i on i.activity_id=r.activity_id and i.person_id=r.person_id
        where r.activity_id=:activity order by p.display_name,p.id""")
    fun people(activity: UUID): List<AttendancePerson>

    @Query("""with members as (
        select m.person_id,case when bool_or(m.role='leader') then 'leader' else 'participant' end as role
        from forena.team_membership m where m.team_id=:team and m.role in ('participant','leader')
          and m.starts_on<=:day and (m.ends_on is null or m.ends_on>=:day)
        group by m.person_id
    ), roster as (
        select coalesce(m.person_id,i.person_id) as person_id,coalesce(i.activity_role,m.role,'participant') as role,i.response
        from members m full join (select * from forena.invitation where activity_id=:activity) i on i.person_id=m.person_id
    ) select p.id as person_id,p.display_name,r.role,r.response,null::boolean as present
        from roster r join forena.person p on p.id=r.person_id order by p.display_name,p.id""")
    fun initialPeople(activity: UUID, team: UUID, day: java.time.LocalDate): List<AttendancePerson>

    @Query("""select distinct p.id as person_id,p.display_name,'participant' as role,
        null::text as response,null::boolean as present from forena.person p
        join forena.team_membership m on m.person_id=p.id and m.organization_id=p.organization_id
        join forena.team t on t.id=m.team_id and t.organization_id=m.organization_id
        where p.organization_id=:organization and t.section_id=:section and m.active
          and m.starts_on<=:day and (m.ends_on is null or m.ends_on>=:day)
        order by p.display_name,p.id""")
    fun candidates(organization: UUID, section: UUID, day: java.time.LocalDate): List<AttendancePerson>

    @Query("select id,revision,actor_name,changed_at from forena.attendance_history where activity_id=:activity order by revision desc")
    fun history(activity: UUID): List<AttendanceHistoryRow>

    @Query("""select c.* from forena.attendance_change c join forena.attendance_history h on h.id=c.history_id
        where h.activity_id=:activity order by c.display_name,c.person_id""")
    fun changes(activity: UUID): List<AttendanceChangeRow>

    @Modifying
    @Query("""insert into forena.attendance_report(activity_id,organization_id,revision,reported_at,reported_by)
        values(:activity,:organization,:revision,:now,:actor) on conflict(activity_id)
        do update set revision=:revision,reported_at=:now,reported_by=:actor""")
    fun writeReport(activity: UUID, organization: UUID, revision: Long, now: Instant, actor: UUID): Int

    @Modifying
    @Query("""insert into forena.attendance_record(activity_id,organization_id,person_id,role,present)
        values(:activity,:organization,:person,:role,:present) on conflict(activity_id,person_id)
        do update set present=:present""")
    fun writePerson(activity: UUID, organization: UUID, person: UUID, role: String, present: Boolean): Int

    @Modifying
    @Query("""insert into forena.attendance_history(id,activity_id,organization_id,revision,actor_subject,actor_name,changed_at)
        values(:id,:activity,:organization,:revision,:actor,:name,:now)""")
    fun writeHistory(id: UUID, activity: UUID, organization: UUID, revision: Long, actor: UUID, name: String, now: Instant): Int

    @Modifying
    @Query("""insert into forena.attendance_change(history_id,person_id,display_name,previous_present,present)
        values(:history,:person,:name,:previous,:present)""")
    fun writeChange(history: UUID, person: UUID, name: String, previous: Boolean?, present: Boolean): Int
}

interface AssistantActivityRepository : Repository<ActivityEntity, UUID> {
    @Query("""select a.id,coalesce(t.system_category,'other') as category
        from forena.activity a left join forena.activity_type t on t.id=a.activity_type_id
        where a.id in (:ids) and a.deleted_at is null""")
    fun findCategories(ids: List<UUID>): List<AssistantActivityCategory>

    @Query(
        """select i.id,i.person_id,p.display_name as name,i.response,i.response_comment,i.revision
            from forena.invitation i join forena.person p on p.id=i.person_id and p.organization_id=i.organization_id
            where i.activity_id=:activity order by p.display_name,i.id"""
    )
    fun findInvitations(activity: UUID): List<AssistantInvitation>

    @Query(
        """select a.id as activity_id,a.title,a.starts_at,
            p.id as person_id,p.display_name as name,d.name as duty,dp.completed from forena.activity a
            join forena.activity_duty d on d.activity_id=a.id join forena.activity_duty_place dp on dp.duty_id=d.id
            join forena.person p on p.id=dp.person_id and p.organization_id=a.organization_id
            where a.team_id=:team and a.deleted_at is null and a.starts_at>=:start and a.starts_at<:end
            order by a.starts_at,a.id,p.id limit 201"""
    )
    fun findDutyHistory(team: UUID, start: Instant, end: Instant): List<DutyHistory>

    @Query(
        """select a.id as activity_id,a.title,a.starts_at,p.id as person_id,p.display_name as name,ap.present,coalesce(t.system_category,'other') as category
            from forena.activity a left join forena.activity_type t on t.id=a.activity_type_id join forena.attendance_record ap on ap.activity_id=a.id
            join forena.person p on p.id=ap.person_id and p.organization_id=a.organization_id
            where a.team_id=:team and a.deleted_at is null and a.starts_at>=:start and a.starts_at<:end
            order by a.starts_at,a.id,p.id limit 201"""
    )
    fun findAttendanceHistory(team: UUID, start: Instant, end: Instant): List<HistoryPerson>

    @Query(
        """select count(*) from forena.activity a join forena.attendance_record ap on ap.activity_id=a.id
            where a.team_id=:team and a.deleted_at is null and a.starts_at>=:start and a.starts_at<:end and ap.present"""
    )
    fun countParticipations(team: UUID, start: Instant, end: Instant): Long

    @Query(
        """select count(distinct ap.person_id) from forena.activity a join forena.attendance_record ap on ap.activity_id=a.id
            where a.team_id=:team and a.deleted_at is null and a.starts_at>=:start and a.starts_at<:end and ap.present"""
    )
    fun countUniqueParticipants(team: UUID, start: Instant, end: Instant): Long

    @Query(
        """select coalesce(t.system_category,'other') as category,
            count(distinct ap.person_id) as unique_people,count(*) as participation_count from forena.activity a
            left join forena.activity_type t on t.id=a.activity_type_id join forena.attendance_record ap on ap.activity_id=a.id
            where a.team_id=:team and a.deleted_at is null and a.starts_at>=:start and a.starts_at<:end and ap.present
            group by t.system_category order by category"""
    )
    fun summarizeAttendance(team: UUID, start: Instant, end: Instant): List<HistorySummary>

    @Query(
        "select exists(select 1 from forena.activity_schedule where activity_id=:id and kind='reminder' and state='pending')"
    )
    fun hasPendingReminder(id: UUID): Boolean

    @Modifying
    @Query(
        """insert into forena.activity_schedule(id,activity_id,organization_id,kind,due_at,audience_roles,person_ids)
            values(:id,:activity,:org,'reminder',:now,'',:people)"""
    )
    fun scheduleReminder(id: UUID, activity: UUID, org: UUID, now: Instant, people: String): Int
}

interface AssistantMemberRepository : Repository<TeamEntity, UUID> {
    @Query(
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
    fun findAssignments(
        org: UUID,
        team: UUID?,
        allTeams: Boolean,
        section: UUID?,
        allSections: Boolean,
    ): List<AssistantMember>

    @Query(
        """select count(distinct m.person_id) from forena.team_membership m
            join forena.team t on t.id=m.team_id and t.organization_id=m.organization_id
            join forena.organization o on o.id=m.organization_id
            where m.organization_id=:org and m.active and (:allTeams or m.team_id=:team) and (:allSections or t.section_id=:section)
            and m.starts_on<=(clock_timestamp() at time zone o.time_zone)::date
            and (m.ends_on is null or m.ends_on>=(clock_timestamp() at time zone o.time_zone)::date)"""
    )
    fun countPeople(
        org: UUID,
        team: UUID?,
        allTeams: Boolean,
        section: UUID?,
        allSections: Boolean,
    ): Long
}

interface ActivityDutyLifecycleRepository : Repository<ActivityDutyEntity, UUID> {
    @Modifying
    @Query(
        """update forena.activity_duty set starts_at=:start,ends_at=:end,
            state=case when :cancelled then 'cancelled' else state end,revision=revision+1
            where activity_id=:activity and state<>'completed'"""
    )
    fun followActivity(start: Instant, end: Instant, cancelled: Boolean, activity: UUID): Int
}

interface ActivityDutyRepository : Repository<ActivityDutyEntity, UUID> {
    @Query(
        """select a.id,a.title,a.starts_at,a.ends_at,a.revision,coalesce(t.system_category,'other') as category,
            a.source_kind,a.series_id,a.external_source,a.venue,
            exists(select 1 from forena.activity_duty d where d.activity_id=a.id and lower(d.name)=lower(:name)) as exists
            from forena.activity a left join forena.activity_type t on t.id=a.activity_type_id where a.id=:id"""
    )
    fun findTarget(name: String, id: UUID): DutyTarget

    @Modifying
    @Query(
        "insert into forena.activity_duty(id,activity_id,organization_id,name,instructions,starts_at,ends_at,created_by) values(:id,:activity,:org,:name,:instructions,:start,:end,:actor)"
    )
    fun insertDuty(
        id: UUID,
        activity: UUID,
        org: UUID,
        name: String,
        instructions: String,
        start: Instant,
        end: Instant,
        actor: UUID,
    ): Int

    @Modifying
    @Query("insert into forena.activity_duty_place(id,duty_id,number) values(:id,:duty,:number)")
    fun insertPlace(id: UUID, duty: UUID, number: Int): Int

    @Modifying
    @Query(
        "insert into forena.activity_duty_audit(duty_id,actor_subject,operation) values(:id,:actor,'created')"
    )
    fun auditCreation(id: UUID, actor: UUID): Int

    @Query(
        """select a.id,a.title,a.starts_at,a.ends_at,a.revision,
            coalesce(t.system_category,'other') as category,a.source_kind,a.series_id,a.external_source,a.venue,
            exists(select 1 from forena.activity_duty d where d.activity_id=a.id and lower(d.name)=lower(:name)) as exists
            from forena.activity a left join forena.activity_type t on t.id=a.activity_type_id
            where a.team_id=:team and a.deleted_at is null and a.status='scheduled' and a.starts_at>clock_timestamp()
            order by a.starts_at,a.id limit 201"""
    )
    fun findTargets(team: UUID, name: String): List<DutyTarget>
}

data class CapacityRow(val id: UUID, val maxParticipants: Int?, val acceptedParticipants: Int)

interface CapacityRepository : Repository<ActivityEntity, UUID> {
    @Query("""select a.max_participants,(select count(*) from forena.invitation i
      where i.activity_id=a.id and i.response='accepted' and coalesce(i.activity_role,
        (select case when bool_or(m.role='leader') then 'leader' else 'participant' end
         from forena.team_membership m join forena.organization o on o.id=m.organization_id
         where m.team_id=a.team_id and m.person_id=i.person_id and m.role in ('participant','leader')
           and m.starts_on<=(a.starts_at at time zone o.time_zone)::date
           and (m.ends_on is null or m.ends_on>=(a.starts_at at time zone o.time_zone)::date)), 'participant')='participant')::integer as accepted_participants
      from forena.activity a where a.id=:activity""")
    fun capacity(activity: UUID): ActivityCapacity

    @Query("""select a.id,a.max_participants,(select count(*) from forena.invitation i
      where i.activity_id=a.id and i.response='accepted' and coalesce(i.activity_role,
        (select case when bool_or(m.role='leader') then 'leader' else 'participant' end
         from forena.team_membership m join forena.organization o on o.id=m.organization_id
         where m.team_id=a.team_id and m.person_id=i.person_id and m.role in ('participant','leader')
           and m.starts_on<=(a.starts_at at time zone o.time_zone)::date
           and (m.ends_on is null or m.ends_on>=(a.starts_at at time zone o.time_zone)::date)), 'participant')='participant')::integer as accepted_participants
      from forena.activity a where a.id in (:ids)""")
    fun capacities(ids: Collection<UUID>): List<CapacityRow>

    @Query("""select coalesce(i.activity_role,
        (select case when bool_or(m.role='leader') then 'leader' else 'participant' end
         from forena.team_membership m join forena.organization o on o.id=m.organization_id
         where m.team_id=a.team_id and m.person_id=i.person_id and m.role in ('participant','leader')
           and m.starts_on<=(a.starts_at at time zone o.time_zone)::date
           and (m.ends_on is null or m.ends_on>=(a.starts_at at time zone o.time_zone)::date)), 'participant')='participant'
      from forena.invitation i join forena.activity a on a.id=i.activity_id
      where i.activity_id=:activity and i.person_id=:person""")
    fun participant(activity: UUID, person: UUID): Boolean
}

interface DisciplineObjectRepository : Repository<TeamEntity, UUID> {
    @Query("""select exists(select 1 from forena.team_membership where team_id=:team and person_id=:person
        and active and starts_on<=:date and (ends_on is null or ends_on>=:date))""")
    fun member(team: UUID, person: UUID, date: LocalDate): Boolean

    @Query("""select p.id,p.display_name as name from forena.invitation i
        join forena.person p on p.id=i.person_id and p.organization_id=i.organization_id
        where i.activity_id=:activity and coalesce(i.activity_role,
          (select case when bool_or(m.role='leader') then 'leader' when bool_or(m.role='participant') then 'participant' end
           from forena.team_membership m where m.team_id=:team and m.person_id=i.person_id
           and m.starts_on<=:date and (m.ends_on is null or m.ends_on>=:date)), '')='participant'
        order by p.display_name,p.id""")
    fun players(activity: UUID, team: UUID, date: LocalDate): List<DisciplinePlayer>

    @Query("""select p.id,p.display_name as name from forena.invitation i
        join forena.person p on p.id=i.person_id and p.organization_id=i.organization_id
        where i.activity_id=:activity and i.response='accepted' and coalesce(i.activity_role,
          (select case when bool_or(m.role='leader') then 'leader' when bool_or(m.role='participant') then 'participant' end
           from forena.team_membership m where m.team_id=:team and m.person_id=i.person_id
           and m.starts_on<=:date and (m.ends_on is null or m.ends_on>=:date)), '')='participant'
        order by p.display_name,p.id""")
    fun acceptedPlayers(activity: UUID, team: UUID, date: LocalDate): List<DisciplinePlayer>
}

private const val FOLLOW_UP_ACTIVITY = """select a.id,a.organization_id,a.team_id,coalesce(s.discipline_key,'common') as discipline_key,
    coalesce(y.slug,'') as slug,coalesce(y.system_category,'') as category,a.title,a.starts_at,a.ends_at,
    a.revision,a.status,o.time_zone,a.deleted_at,a.imported,a.response_due_at from forena.activity a
    join forena.organization o on o.id=a.organization_id
    join forena.team t on t.id=a.team_id and t.organization_id=a.organization_id
    left join forena.section s on s.id=t.section_id and s.organization_id=t.organization_id
    left join forena.activity_type y on y.id=a.activity_type_id """
interface FollowUpActivityRepository : Repository<ManagedActivityEntity, UUID> {
    @Query("select id from forena.activity where team_id=:team and starts_at>clock_timestamp() and deleted_at is null order by id")
    fun futureActivityIds(team: UUID): List<UUID>
    @Query("""select count(*)::integer as invited,
        count(*) filter(where i.response='accepted')::integer as accepted,
        count(*) filter(where i.response='pending')::integer as pending
        from forena.invitation i join forena.activity a on a.id=i.activity_id
        join forena.organization o on o.id=a.organization_id
        where a.id=:activity and coalesce(i.activity_role,
            (select case when bool_or(m.role='leader') then 'leader' when bool_or(m.role='participant') then 'participant' end
             from forena.team_membership m where m.team_id=a.team_id and m.person_id=i.person_id
             and m.starts_on<=(a.starts_at at time zone o.time_zone)::date
             and (m.ends_on is null or m.ends_on>=(a.starts_at at time zone o.time_zone)::date)), '')='participant'""")
    fun capabilityCounts(activity: UUID): CapabilityPlayerCounts

    @Query("""select distinct p.subject from forena.person_access p
        join forena.account a on a.subject=p.subject and a.enabled
        join forena.team_membership m on m.person_id=p.person_id and m.organization_id=p.organization_id
        join forena.organization o on o.id=m.organization_id
        where m.team_id=:team and m.active and p.active and p.kind='self'
        and m.starts_on<=(:now at time zone o.time_zone)::date
        and (m.ends_on is null or m.ends_on>=(:now at time zone o.time_zone)::date)""")
    fun associatedSubjects(team: UUID, now: Instant): List<UUID>

    @Query("""select o.time_zone,t.season from forena.team t join forena.organization o on o.id=t.organization_id where t.id=:team""")
    fun period(team: UUID): TeamReportPeriod?
    @Query("select coalesce(s.discipline_key,'common') from forena.team t left join forena.section s on s.id=t.section_id where t.id=:team")
    fun teamDiscipline(team: UUID): String?
    @Query(FOLLOW_UP_ACTIVITY + " where a.id=:id")
    fun activity(id: UUID): FollowUpActivity?
    @Query(FOLLOW_UP_ACTIVITY + " where a.team_id=:team and a.deleted_at is null and a.starts_at>=:from and a.starts_at<:until order by a.starts_at,a.id limit 20001")
    fun teamActivities(team: UUID, from: Instant, until: Instant): List<FollowUpActivity>

    @Query("""select exists(select 1 from forena.team_membership m
        join forena.person_access p on p.person_id=m.person_id and p.organization_id=m.organization_id
        join forena.organization o on o.id=m.organization_id
        where m.team_id=:team and m.role='leader' and m.active and p.subject=:subject and p.kind='self' and p.active
        and m.starts_on<=(:now at time zone o.time_zone)::date
        and (m.ends_on is null or m.ends_on>=(:now at time zone o.time_zone)::date))""")
    fun leader(subject: UUID, team: UUID, now: Instant): Boolean

    @Query("""select distinct p.subject from forena.team_membership m
        join forena.person_access p on p.person_id=m.person_id and p.organization_id=m.organization_id
        join forena.organization o on o.id=m.organization_id
        join forena.account c on c.subject=p.subject and c.enabled
        where m.team_id=:team and m.role='leader' and m.active and p.kind='self' and p.active
        and m.starts_on<=(:now at time zone o.time_zone)::date
        and (m.ends_on is null or m.ends_on>=(:now at time zone o.time_zone)::date)""")
    fun leaderRecipients(team: UUID, now: Instant): List<UUID>
    @Query("""select distinct p.id,p.display_name as name from forena.attendance_record r
        join forena.activity a on a.id=r.activity_id and a.organization_id=r.organization_id
        join forena.person p on p.id=r.person_id and p.organization_id=r.organization_id
        where a.team_id=:team and a.id in (:activities) and r.role='participant' and r.present order by p.display_name,p.id""")
    fun players(team: UUID, activities: Collection<UUID>): List<DisciplinePlayer>
}
