package se.forena.api.identity.internal

import java.time.Instant
import java.util.Optional
import java.util.UUID
import org.springframework.data.jdbc.repository.query.Modifying
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

interface UserRepository : Repository<UserEntity, UUID> {
    fun findById(subject: UUID): UserEntity?
    fun findByEmail(email: String): UserEntity?
    @Modifying
    @Query("insert into forena.account(subject) values(:subject)")
    fun createAccount(subject: UUID): Int
    @Modifying
    @Query("insert into forena.native_user(subject,email,password_hash) values(:subject,:email,:passwordHash)")
    fun createUser(subject: UUID, email: String, passwordHash: String): Int
    @Modifying
    @Query("update forena.native_user set verified=true where subject=:subject and auth_version=:authVersion and verified=false")
    fun verifyEmail(subject: UUID, authVersion: Long): Int
    @Modifying
    @Query("update forena.native_user set password_hash=:passwordHash,auth_version=auth_version+1 where subject=:subject and auth_version=:authVersion and verified=true")
    fun resetPassword(subject: UUID, passwordHash: String, authVersion: Long): Int
    @Modifying
    @Query("update forena.native_user set password_hash=:passwordHash,auth_version=auth_version+1 where subject=:subject and verified=false")
    fun replacePendingPassword(subject: UUID, passwordHash: String): Int
    @Modifying
    @Query("update forena.account set enabled=:enabled where subject=:subject")
    fun setEnabled(subject: UUID, enabled: Boolean): Int
}
