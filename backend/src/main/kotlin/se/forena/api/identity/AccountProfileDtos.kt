package se.forena.api.identity

import io.swagger.v3.oas.annotations.media.Schema
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

data class OwnProfile(val name: String, val phone: String, val revision: Long)
data class AccountPerson(
    val id: UUID, val organizationId: UUID, val organizationName: String, val kind: String,
    val name: String, val birthDate: LocalDate?, val phone: String, val contactEmail: String,
    val address: String, val revision: Long, val editable: Boolean, val linkGroup: UUID?,
)
data class AccountClub(val id: UUID, val name: String)
data class AccountProfileView(
    val profile: OwnProfile, val email: String, val people: List<AccountPerson>, val clubs: List<AccountClub>,
    val deletionAt: Instant?, val activated: Boolean, val followers: List<FollowerView>,
)
data class OwnProfileCommand(val name: String, val phone: String, val revision: Long, val people: Map<UUID, Long>)
data class ChildProfileCommand(
    val name: String, val birthDate: LocalDate?, val phone: String, val contactEmail: String,
    val address: String, val people: Map<UUID, Long>,
)
data class ChildLinkCommand(val people: Set<UUID>)
data class ProfileHistory(val id: UUID, val actor: String, val changedAt: Instant, val changes: String)
data class GuardianProposalCommand(val email: String, val operation: String)
data class GuardianProposalView(val id: UUID, val personId: UUID, val email: String, val operation: String, val state: String)
data class ReviewGuardianCommand(val approve: Boolean)
data class FollowerView(
    val id: UUID, val personId: UUID, val organizationId: UUID, val organizationName: String,
    val personName: String, val requester: String, val state: String, val incoming: Boolean,
    val expiresAt: Instant, val teams: List<String> = emptyList(),
)
data class FollowerDecision(val state: String)
data class FollowerMatch(val id: UUID, val title: String, val startsAt: Instant, val endsAt: Instant, val location: String, val result: String? = null)
data class AccountSessionView(val id: String, val device: String, val lastActiveAt: Instant, val current: Boolean)
class ReauthenticateCommand(@get:Schema(accessMode = Schema.AccessMode.WRITE_ONLY) val password: String)
class PasswordChangeCommand(@get:Schema(accessMode = Schema.AccessMode.WRITE_ONLY) val password: String)
data class EmailChangeCommand(val email: String)
class EmailConfirmCommand(@get:Schema(accessMode = Schema.AccessMode.WRITE_ONLY) val code: String)
data class PasskeyLabelCommand(val label: String)

data class ClubAccountPerson(val id: UUID, val name: String, val birthDate: LocalDate?, val revision: Long)
data class BirthDateCorrectionCommand(val birthDate: LocalDate?, val revision: Long)
data class ClubAccountView(val people: List<ClubAccountPerson>, val proposals: List<GuardianProposalView>)

internal data class AccountLifecycleStatus(val activated: Boolean, val deletionAt: Instant?)
