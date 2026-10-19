package se.forena.api.participation.internal

import java.time.Instant
import java.util.Optional
import java.util.UUID
import org.springframework.data.annotation.Id
import org.springframework.data.annotation.ReadOnlyProperty
import org.springframework.data.annotation.Transient
import org.springframework.data.domain.Persistable
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

    @Lock(LockMode.PESSIMISTIC_WRITE)
    fun findLockedByIdAndOrganizationId(id: UUID, organizationId: UUID): ActivityRecord?
}

/** Identity is immutable; the Kotlin service owns response metadata. */
@Table(value = "invitation", schema = "forena")
data class InvitationRecord(
    @Id val id: UUID,
    @ReadOnlyProperty val organizationId: UUID,
    @ReadOnlyProperty val activityId: UUID,
    @ReadOnlyProperty val personId: UUID,
    val response: String,
    val responseComment: String?,
    val respondedAt: Instant?,
    val revision: Long
)

interface InvitationRepository : Repository<InvitationRecord, UUID> {
    fun findByActivityIdAndPersonIdIn(activityId: UUID, personIds: Collection<UUID>): List<InvitationRecord>

    @Lock(LockMode.PESSIMISTIC_WRITE)
    fun findLockedByIdAndOrganizationIdAndActivityIdAndPersonId(id: UUID, organizationId: UUID, activityId: UUID, personId: UUID): InvitationRecord?

    fun findById(id: UUID): Optional<InvitationRecord>

    fun save(invitation: InvitationRecord): InvitationRecord
}

@Table(value = "invitation_history", schema = "forena")
data class InvitationHistoryRecord(
    @Id val id: UUID? = null,
    val invitationId: UUID,
    val organizationId: UUID,
    val actorSubject: UUID,
    val sessionId: UUID,
    val channel: String,
    val changedAt: Instant,
    val previousResponse: String,
    val response: String,
    val revision: Long
)

interface InvitationHistoryRepository : Repository<InvitationHistoryRecord, UUID> {
    fun save(history: InvitationHistoryRecord): InvitationHistoryRecord
}

@Table(value = "activity_signal_state", schema = "forena")
data class ActivitySignalRecord(
    @Id val activityId: UUID,
    val dirtyRevision: Long,
    val changedAt: Instant,
    @Transient val newRecord: Boolean = false
) : Persistable<UUID> {
    override fun getId(): UUID = activityId
    override fun isNew(): Boolean = newRecord
}

interface ActivitySignalRepository : Repository<ActivitySignalRecord, UUID> {
    fun findById(id: UUID): Optional<ActivitySignalRecord>
    fun save(signal: ActivitySignalRecord): ActivitySignalRecord
}
