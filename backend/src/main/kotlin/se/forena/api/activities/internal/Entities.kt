package se.forena.api.activities.internal

import java.time.Instant
import java.util.UUID
import org.springframework.data.annotation.Id
import org.springframework.data.annotation.ReadOnlyProperty
import org.springframework.data.annotation.Transient
import org.springframework.data.domain.Persistable
import org.springframework.data.relational.core.mapping.Table

@Table(value = "activity", schema = "forena")
data class ActivityRecord(
    @Id val id: UUID,
    val organizationId: UUID,
    val status: String,
    val endsAt: Instant,
    val invitationSendAt: Instant?
)

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

@Table(value = "invitation_history", schema = "forena")
data class InvitationHistoryRecord(
    @Id val id: UUID? = null,
    val invitationId: UUID,
    val organizationId: UUID,
    val actorSubject: UUID,
    val channel: String,
    val changedAt: Instant,
    val previousResponse: String,
    val response: String,
    val revision: Long
)

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

/** Read projection only; authorized person IDs come from identity's public service. */
data class ActivityOverviewRecord(
    val id: UUID, val title: String, val startsAt: Instant, val endsAt: Instant,
    val organizationName: String, val teamName: String
)
