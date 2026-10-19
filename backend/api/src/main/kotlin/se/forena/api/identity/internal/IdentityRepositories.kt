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

/** PostgreSQL connection state and wall clock have no derived CRUD equivalent. */
interface DatabaseSessionRepository : Repository<AccountRecord, UUID> {
    @Query("""
        select set_config('forena.actor_id', :subject, true) = :subject
           and set_config('forena.session_id', :session, true) = :session
    """)
    fun bindIdentity(subject: String, session: String): Boolean

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
    fun findByOrganizationIdAndActiveTrue(organizationId: UUID): List<PersonAccessRecord>
}

@Table(value = "person", schema = "forena")
data class PersonRecord(@Id val id: UUID, val organizationId: UUID, val displayName: String)

interface PersonRepository : Repository<PersonRecord, UUID> {
    fun findByIdInOrderByDisplayNameAsc(ids: Collection<UUID>): List<PersonRecord>
}
