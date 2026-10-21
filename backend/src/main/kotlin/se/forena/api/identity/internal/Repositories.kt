package se.forena.api.identity.internal

import java.time.Instant
import java.util.Optional
import java.util.UUID
import org.springframework.data.jdbc.repository.query.Query
import org.springframework.data.repository.Repository

interface AccountRepository : Repository<AccountRecord, UUID> {
    fun existsBySubjectAndEnabledTrue(subject: UUID): Boolean
}

/** Current wall clock, including time spent waiting for row locks. */
interface DatabaseClockRepository : Repository<AccountRecord, UUID> {
    @Query("select clock_timestamp()")
    fun databaseTime(): Instant
}

interface RevokedSessionRepository : Repository<RevokedSessionRecord, UUID> {
    fun existsByIdAndSubject(id: UUID, subject: UUID): Boolean
}

interface PersonAccessRepository : Repository<PersonAccessRecord, PersonAccessKey> {
    fun findById(id: PersonAccessKey): Optional<PersonAccessRecord>
    fun findByKeySubjectAndOrganizationIdAndActiveTrue(subject: UUID, organizationId: UUID): List<PersonAccessRecord>
}

interface PersonRepository : Repository<PersonRecord, UUID> {
    fun findByIdInOrderByDisplayNameAsc(ids: Collection<UUID>): List<PersonRecord>
}
