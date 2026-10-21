package se.forena.api.identity.internal

import java.time.Instant
import java.util.Optional
import java.util.UUID
import org.springframework.data.jdbc.repository.query.Query
import org.springframework.data.repository.Repository

interface AccountRepository : Repository<AccountEntity, UUID> {
    fun existsBySubjectAndEnabledTrue(subject: UUID): Boolean
}

/** Current wall clock, including time spent waiting for row locks. */
interface DatabaseClockRepository : Repository<AccountEntity, UUID> {
    @Query("select clock_timestamp()")
    fun databaseTime(): Instant
}

interface RevokedSessionRepository : Repository<RevokedSessionEntity, UUID> {
    fun existsByIdAndSubject(id: UUID, subject: UUID): Boolean
}

interface PersonAccessRepository : Repository<PersonAccessEntity, PersonAccessKey> {
    fun findByKeySubjectAndActiveTrue(subject: UUID): List<PersonAccessEntity>
    fun findById(id: PersonAccessKey): Optional<PersonAccessEntity>
    fun findByKeySubjectAndOrganizationIdAndActiveTrue(subject: UUID, organizationId: UUID): List<PersonAccessEntity>
}

interface PersonRepository : Repository<PersonEntity, UUID> {
    fun findByIdInOrderByDisplayNameAsc(ids: Collection<UUID>): List<PersonEntity>
}
