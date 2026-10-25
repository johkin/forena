package se.forena.api.activities.internal

import java.time.Instant
import java.util.UUID
import org.springframework.data.annotation.Id
import org.springframework.data.annotation.ReadOnlyProperty
import org.springframework.data.annotation.Transient
import org.springframework.data.domain.Persistable
import org.springframework.data.relational.core.mapping.Table
import org.springframework.data.relational.core.mapping.Column

@Table(value = "activity", schema = "forena")
data class ActivityEntity(
    @Id val id: UUID,
    val organizationId: UUID,
    val status: String,
    val endsAt: Instant,
    val invitationSendAt: Instant?
)

/** Identity is immutable; the Kotlin service owns response metadata. */
@Table(value = "invitation", schema = "forena")
data class InvitationEntity(
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
data class InvitationHistoryEntity(
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
data class ActivitySignalEntity(
    @Id val activityId: UUID,
    val dirtyRevision: Long,
    val changedAt: Instant,
    @Transient val newRecord: Boolean = false
) : Persistable<UUID> {
    override fun getId(): UUID = activityId
    override fun isNew(): Boolean = newRecord
}

/** Read projection only; authorized person IDs come from identity's public service. */
data class ActivityOverviewRow(
    val id: UUID, val title: String, val startsAt: Instant, val endsAt: Instant,
    val organizationName: String, val teamName: String
)

@Table(value = "organization", schema = "forena")
data class OrganizationEntity(@Id val id: UUID, val name: String, val timeZone: String)

@Table(value = "team", schema = "forena")
data class TeamEntity(@Id val id: UUID, val organizationId: UUID, val name: String)

@Table(value = "team_membership", schema = "forena")
data class TeamMembershipEntity(
    @Id val id: UUID, val organizationId: UUID, val teamId: UUID, val personId: UUID,
    val role: String, val startsOn: java.time.LocalDate, val endsOn: java.time.LocalDate?, val active: Boolean
)

@Table(value = "team_access_assignment", schema = "forena")
data class TeamAccessAssignmentEntity(
    @Id val id: UUID, val organizationId: UUID, val teamId: UUID, val personId: UUID,
    val startsOn: java.time.LocalDate, val endsOn: java.time.LocalDate?, val active: Boolean
)

@Table(value = "organization_member", schema = "forena")
data class OrganizationMemberEntity(
    @Id val id: UUID, val organizationId: UUID, val subject: UUID, val role: String, val active: Boolean
)

/** Authorized activity metadata; person rows are assembled from independently scoped relations. */
data class PersonalActivityRow(
    val id: UUID, val organizationId: UUID, val teamId: UUID, val title: String,
    val startsAt: Instant, val endsAt: Instant, val invitationSendAt: Instant?,
    val gatheringAt: Instant?, val responseDueAt: Instant?, val location: String,
    val description: String, val status: String
)

@Table(value = "activity", schema = "forena")
data class ManagedActivityEntity(
    @Id @Column("id") val activityId: UUID,
    val organizationId: UUID,
    val teamId: UUID,
    val activityTypeId: UUID?,
    val title: String,
    val description: String,
    val location: String,
    val startsAt: Instant,
    val endsAt: Instant,
    val gatheringAt: Instant?,
    val invitationSendAt: Instant?,
    val responseDueAt: Instant?,
    val status: String = "scheduled",
    val revision: Long = 0,
    val cancelledAt: Instant? = null,
    val cancellationReason: String? = null,
    val seriesId: UUID? = null,
    @Transient val newRecord: Boolean = false
) : Persistable<UUID> {
    override fun getId(): UUID = activityId
    override fun isNew(): Boolean = newRecord
}

@Table(value = "activity_audit", schema = "forena")
data class ActivityAuditEntity(
    @Id val id: UUID?, val activityId: UUID, val organizationId: UUID,
    val actorSubject: UUID, val operation: String, val revision: Long, val changedAt: Instant
)

@Table(value = "activity_schedule", schema = "forena")
data class ActivityScheduleEntity(
    @Id val id: UUID?,
    val activityId: UUID,
    val organizationId: UUID,
    val kind: String,
    val dueAt: Instant,
    val state: String = "pending",
    val audienceRoles: String = "",
    val personIds: String = "",
    val groupIds: String = "",
    val responsibilityTypeIds: String = "",
    val attempts: Int = 0,
    val nextAttempt: Instant = dueAt,
    val lastError: String? = null,
    val completedAt: Instant? = null
)

@Table(value = "activity_type", schema = "forena")
data class ActivityTypeEntity(
    @Id val id: UUID, val organizationId: UUID?, val name: String, val slug: String,
    val systemCategory: String, val disciplineKey: String?, val active: Boolean
)

data class ManagementTeamRow(
    val id: UUID, val organizationId: UUID, val name: String, val organizationName: String,
    val timeZone: String, val disciplineKey: String?, val sectionId: UUID?
)
data class ManagementPersonRow(val id: UUID, val displayName: String, val role: String)

@Table(value = "activity_defaults", schema = "forena")
data class ActivityDefaultsEntity(@Id val id: UUID, val organizationId: UUID, val sectionId: UUID?,
    val teamId: UUID?, val activityTypeId: UUID, val disciplineKey: String, val version: String,
    val revision: Long, val valuesJson: String)
@Table(value = "team_audience_group", schema = "forena")
data class AudienceGroupEntity(@Id val id: UUID, val organizationId: UUID, val teamId: UUID, val name: String, val kind: String)
@Table(value = "team_audience_member", schema = "forena")
data class AudienceMemberEntity(@Id val id: UUID, val groupId: UUID, val organizationId: UUID, val personId: UUID, val active: Boolean)
