package se.forena.api.notifications.internal

import java.time.Instant
import java.util.UUID
import org.springframework.data.annotation.Id
import org.springframework.data.relational.core.mapping.Table

@Table(value = "invitation_email", schema = "forena")
data class InvitationEmailEntity(
    @Id val id: UUID,
    val recipient: String,
    val subject: String,
    val body: String,
    val state: String,
    val attempts: Int,
    val nextAttempt: Instant,
    val firstAttemptAt: Instant?,
    val providerMessageId: String?,
    val acceptedAt: Instant?,
    val lastError: String?,
)

@Table(value = "push_subscription", schema = "forena")
data class PushSubscriptionEntity(@Id val id: UUID)
