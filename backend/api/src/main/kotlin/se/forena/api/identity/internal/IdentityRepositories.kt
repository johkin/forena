package se.forena.api.identity.internal

import java.util.Optional
import java.util.UUID
import org.springframework.data.annotation.Id
import org.springframework.data.relational.core.mapping.Embedded
import org.springframework.data.relational.core.mapping.Table
import org.springframework.data.repository.Repository
import org.springframework.data.jdbc.repository.query.Query
import java.time.Instant

@Table(value = "account", schema = "forena")
data class AccountRecord(@Id val subject: UUID, val enabled: Boolean)

interface AccountRepository : Repository<AccountRecord, UUID> {
    fun existsBySubjectAndEnabledTrue(subject: UUID): Boolean
}

/** Current wall clock, including time spent waiting for row locks. */
interface DatabaseClockRepository : Repository<AccountRecord, UUID> {
    @Query("select clock_timestamp()")
    fun databaseTime(): Instant
}

@Table(value = "revoked_session", schema = "forena")
data class RevokedSessionRecord(@Id val id: UUID, val subject: UUID)

interface RevokedSessionRepository : Repository<RevokedSessionRecord, UUID> {
    fun existsByIdAndSubject(id: UUID, subject: UUID): Boolean
}

data class PersonAccessKey(val personId: UUID, val subject: UUID)

@Table(value = "person_access", schema = "forena")
data class PersonAccessRecord(
    @Id @Embedded(onEmpty = Embedded.OnEmpty.USE_EMPTY) val key: PersonAccessKey,
    val organizationId: UUID,
    val kind: String,
    val active: Boolean
)

interface PersonAccessRepository : Repository<PersonAccessRecord, PersonAccessKey> {
    fun findById(id: PersonAccessKey): Optional<PersonAccessRecord>
    fun findByKeySubjectAndOrganizationIdAndActiveTrue(subject: UUID, organizationId: UUID): List<PersonAccessRecord>
}

@Table(value = "person", schema = "forena")
data class PersonRecord(@Id val id: UUID, val organizationId: UUID, val displayName: String)

interface PersonRepository : Repository<PersonRecord, UUID> {
    fun findByIdInOrderByDisplayNameAsc(ids: Collection<UUID>): List<PersonRecord>
}
