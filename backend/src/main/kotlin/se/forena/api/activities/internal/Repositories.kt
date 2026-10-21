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
    fun findByActivityIdAndPersonIdIn(activityId: UUID, personIds: Collection<UUID>): List<InvitationEntity>

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
