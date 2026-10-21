package se.forena.api.activities.internal

import java.time.Instant
import org.springframework.data.jdbc.repository.query.Query
import java.util.Optional
import java.util.UUID
import org.springframework.data.relational.core.sql.LockMode
import org.springframework.data.relational.repository.Lock
import org.springframework.data.repository.Repository

interface ActivityRepository : Repository<ActivityRecord, UUID> {
    fun findById(id: UUID): Optional<ActivityRecord>

    @Lock(LockMode.PESSIMISTIC_WRITE)
    fun findLockedByIdAndOrganizationId(id: UUID, organizationId: UUID): ActivityRecord?
}

interface InvitationRepository : Repository<InvitationRecord, UUID> {
    fun findByActivityIdAndPersonIdIn(activityId: UUID, personIds: Collection<UUID>): List<InvitationRecord>

    @Lock(LockMode.PESSIMISTIC_WRITE)
    fun findLockedByIdAndOrganizationIdAndActivityIdAndPersonId(id: UUID, organizationId: UUID, activityId: UUID, personId: UUID): InvitationRecord?

    fun findById(id: UUID): Optional<InvitationRecord>

    fun save(invitation: InvitationRecord): InvitationRecord
}

interface InvitationHistoryRepository : Repository<InvitationHistoryRecord, UUID> {
    fun save(history: InvitationHistoryRecord): InvitationHistoryRecord
}

interface ActivitySignalRepository : Repository<ActivitySignalRecord, UUID> {
    fun findById(id: UUID): Optional<ActivitySignalRecord>
    fun save(signal: ActivitySignalRecord): ActivitySignalRecord
}

interface ActivityOverviewRepository : Repository<ActivityRecord, UUID> {
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
    fun findUpcoming(people: Collection<UUID>, now: Instant, until: Instant, offset: Int): List<ActivityOverviewRecord>
}
