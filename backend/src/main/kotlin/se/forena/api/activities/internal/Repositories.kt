package se.forena.api.activities.internal

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
