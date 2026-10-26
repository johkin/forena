package se.forena.api.administration.internal

import java.time.LocalDate
import java.util.UUID
import org.springframework.data.jdbc.repository.query.Modifying
import org.springframework.data.jdbc.repository.query.Query
import org.springframework.data.repository.Repository

interface ClubRepository : Repository<ClubEntity, UUID> {
    fun findAllByOrderByNameAsc(): List<ClubEntity>
    fun findByIdInOrderByNameAsc(ids: Collection<UUID>): List<ClubEntity>
    fun findById(id: UUID): ClubEntity?
    fun findBySlug(slug: String): ClubEntity?
    fun save(club: ClubEntity): ClubEntity
}
interface SectionRepository : Repository<SectionEntity, UUID> {
    fun findByOrganizationId(organization: UUID): List<SectionEntity>
    fun findById(id: UUID): SectionEntity?
    fun save(section: SectionEntity): SectionEntity
    fun delete(section: SectionEntity)
}
interface AdministrationTeamRepository : Repository<AdministrationTeamEntity, UUID> {
    fun findByOrganizationId(organization: UUID): List<AdministrationTeamEntity>
    fun findBySectionId(section: UUID): List<AdministrationTeamEntity>
    fun findById(id: UUID): AdministrationTeamEntity?
    fun save(team: AdministrationTeamEntity): AdministrationTeamEntity
    fun delete(team: AdministrationTeamEntity)
}
interface ClubAdministratorRepository : Repository<ClubAdministratorEntity, UUID> {
    fun findByOrganizationIdAndActiveTrue(organization: UUID): List<ClubAdministratorEntity>
    fun findBySubjectAndActiveTrue(subject: UUID): List<ClubAdministratorEntity>
    fun findByOrganizationIdAndSubject(organization: UUID, subject: UUID): ClubAdministratorEntity?
    fun save(role: ClubAdministratorEntity): ClubAdministratorEntity
}
interface SectionAdministratorRepository : Repository<SectionAdministratorEntity, UUID> {
    fun findBySubjectAndActiveTrue(subject: UUID): List<SectionAdministratorEntity>
    fun findBySectionId(section: UUID): List<SectionAdministratorEntity>
    fun findBySectionIdAndSubject(section: UUID, subject: UUID): SectionAdministratorEntity?
    fun save(role: SectionAdministratorEntity): SectionAdministratorEntity
}
interface TeamAdministratorRepository : Repository<TeamAdministratorEntity, UUID> {
    fun findBySubjectAndActiveTrue(subject: UUID): List<TeamAdministratorEntity>
    fun findByTeamId(team: UUID): List<TeamAdministratorEntity>
    fun findByTeamIdAndSubject(team: UUID, subject: UUID): TeamAdministratorEntity?
    fun save(role: TeamAdministratorEntity): TeamAdministratorEntity
}
interface PlatformAdministratorRepository : Repository<PlatformAdministratorEntity, UUID> {
    fun existsById(subject: UUID): Boolean
    fun findAll(): List<PlatformAdministratorEntity>
    @Modifying @Query("insert into forena.platform_administrator(subject) values(:subject) on conflict do nothing")
    fun add(subject: UUID): Int
    @Modifying @Query("delete from forena.platform_administrator where subject=:subject")
    fun remove(subject: UUID): Int
}
interface AdministrationRepository : Repository<AdministrationStateEntity, Boolean> {
    @Query("select * from forena.administration_state where id=true for update")
    fun lock(): AdministrationStateEntity
    @Query("select initialized from forena.administration_state where id=true")
    fun initialized(): Boolean
    @Modifying @Query("update forena.administration_state set initialized=true where id=true")
    fun initialize(): Int
    @Modifying @Query("insert into forena.administration_audit(actor_subject,operation,target_id,target_subject) values(:actor,:operation,:target,:recipient)")
    fun audit(actor: UUID, operation: String, target: UUID, recipient: UUID?): Int
    @Modifying
    @Query("insert into forena.team_access_assignment(id,organization_id,team_id,person_id,starts_on,ends_on,active) values(:id,:organization,:team,:person,:starts,:ends,:active)")
    fun createReadAccess(id: UUID, organization: UUID, team: UUID, person: UUID, starts: LocalDate, ends: LocalDate?, active: Boolean): Int
    @Modifying
    @Query("update forena.team_access_assignment set starts_on=:starts,ends_on=:ends,active=:active where id=:id")
    fun readAccess(id: UUID, starts: LocalDate, ends: LocalDate?, active: Boolean): Int
    @Query("""select not exists(select 1 from forena.activity where team_id=:team)
        and not exists(select 1 from forena.team_membership where team_id=:team)
        and not exists(select 1 from forena.team_administrator where team_id=:team)
        and not exists(select 1 from forena.team_access_assignment where team_id=:team)
        and not exists(select 1 from forena.team_permission_assignment where team_id=:team)
        and not exists(select 1 from forena.activity_defaults where team_id=:team)
        and not exists(select 1 from forena.team_audience_group where team_id=:team)
        and not exists(select 1 from forena.roster_audit where team_id=:team)""")
    fun teamEmpty(team: UUID): Boolean
    @Query("select not exists(select 1 from forena.team where section_id=:section) and not exists(select 1 from forena.activity_defaults where section_id=:section)")
    fun sectionDisciplineMutable(section: UUID): Boolean
    @Query("select not exists(select 1 from forena.section_administrator where section_id=:section)")
    fun sectionHasNoAdministrators(section: UUID): Boolean
}
