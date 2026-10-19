package se.forena.api.participation.internal

import java.time.Instant
import java.util.Optional
import java.util.UUID
import org.springframework.data.annotation.Id
import org.springframework.data.annotation.ReadOnlyProperty
import org.springframework.data.relational.repository.Lock
import org.springframework.data.relational.core.mapping.Table
import org.springframework.data.relational.core.sql.LockMode
import org.springframework.data.repository.Repository

@Table(value = "activity", schema = "forena")
data class ActivityRecord(
    @Id val id: UUID,
    val organizationId: UUID,
    val status: String,
    val endsAt: Instant,
    val invitationSendAt: Instant?
)

interface ActivityRepository : Repository<ActivityRecord, UUID> {
    fun findById(id: UUID): Optional<ActivityRecord>
}

/** Only response fields are writable. Lifecycle, identity and revision remain database-owned. */
@Table(value = "invitation", schema = "forena")
data class InvitationRecord(
    @Id val id: UUID,
    @ReadOnlyProperty val organizationId: UUID,
    @ReadOnlyProperty val activityId: UUID,
    @ReadOnlyProperty val personId: UUID,
    val response: String,
    val responseComment: String?,
    @ReadOnlyProperty val respondedAt: Instant?,
    @ReadOnlyProperty val revision: Long
)

interface InvitationRepository : Repository<InvitationRecord, UUID> {
    fun findByActivityIdAndPersonIdIn(activityId: UUID, personIds: Collection<UUID>): List<InvitationRecord>

    @Lock(LockMode.PESSIMISTIC_WRITE)
    fun findLockedById(id: UUID): InvitationRecord?

    fun save(invitation: InvitationRecord): InvitationRecord
}
