package se.forena.api.administration

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import se.forena.api.administration.internal.AdministrationTeamEntity
import se.forena.api.administration.internal.AdministrationTeamRepository
import se.forena.api.administration.internal.ClubAdministratorEntity
import se.forena.api.administration.internal.ClubAdministratorRepository
import se.forena.api.administration.internal.ClubEntity
import se.forena.api.administration.internal.ClubRepository
import se.forena.api.administration.internal.PlatformAdministratorRepository
import se.forena.api.administration.internal.SectionAdministratorEntity
import se.forena.api.administration.internal.SectionAdministratorRepository
import se.forena.api.administration.internal.SectionRepository
import se.forena.api.administration.internal.TeamAdministratorEntity
import se.forena.api.administration.internal.TeamAdministratorRepository
import se.forena.api.identity.Actor
import se.forena.api.identity.AdministrationDirectory
import se.forena.api.identity.DatabaseClockService
import se.forena.api.identity.PersonAccessService

/** Current role facts and policies. Calling commands authenticate the actor before admission. */
@Service
@Transactional(readOnly = true)
class AdministrationAccessService(
    private val platforms: PlatformAdministratorRepository,
    private val clubs: ClubRepository,
    private val sections: SectionRepository,
    private val teams: AdministrationTeamRepository,
    private val clubAdmins: ClubAdministratorRepository,
    private val sectionAdmins: SectionAdministratorRepository,
    private val teamAdmins: TeamAdministratorRepository,
    private val directory: AdministrationDirectory,
    private val people: PersonAccessService,
    private val clock: DatabaseClockService,
) {
    fun isPlatformAdministrator(subject: UUID): Boolean = platforms.existsById(subject)

    fun isClubAdministrator(subject: UUID, organization: UUID): Boolean =
        isClubAdministrator(clubAdmins.findByOrganizationIdAndSubject(organization, subject))

    fun isSectionAdministrator(subject: UUID, organization: UUID, section: UUID): Boolean =
        sectionBelongsToOrganization(organization, section) &&
            hasSectionRole(subject, organization, section)

    fun isTeamAdministrator(subject: UUID, teamId: UUID): Boolean =
        teams.findById(teamId)?.let { isTeamAdministrator(subject, it) } == true

    fun sectionBelongsToOrganization(organization: UUID, section: UUID): Boolean =
        sections.findById(section)?.organizationId == organization

    fun canAdministerClubStructure(subject: UUID, organization: UUID): Boolean =
        isPlatformAdministrator(subject) || isClubAdministrator(subject, organization)

    fun canAdministerSectionStructure(subject: UUID, organization: UUID, section: UUID): Boolean =
        sectionBelongsToOrganization(organization, section) &&
            (isPlatformAdministrator(subject) || hasSectionBusinessAuthority(subject, organization, section))

    fun canAdministerSectionBusiness(subject: UUID, organization: UUID, section: UUID): Boolean =
        sectionBelongsToOrganization(organization, section) &&
            hasSectionBusinessAuthority(subject, organization, section)

    fun canAdministerTeamStructure(subject: UUID, teamId: UUID): Boolean =
        canAdministerTeamStructure(subject, teams.findById(teamId) ?: throw NoSuchElementException())

    fun canAdministerTeamBusiness(subject: UUID, teamId: UUID): Boolean =
        canAdministerTeamBusiness(subject, teams.findById(teamId) ?: throw NoSuchElementException())

    internal fun canAdministerTeamStructure(subject: UUID, team: AdministrationTeamEntity): Boolean =
        isPlatformAdministrator(subject) || canAdministerTeamBusiness(subject, team)

    internal fun canAdministerTeamBusiness(subject: UUID, team: AdministrationTeamEntity): Boolean =
        isClubAdministrator(subject, team.organizationId) ||
            team.sectionId?.let { isSectionAdministrator(subject, team.organizationId, it) } == true ||
            isTeamAdministrator(subject, team)

    internal fun isClubAdministrator(role: ClubAdministratorEntity?): Boolean =
        role?.let { it.active && it.role in ADMINISTRATOR_ROLES } == true

    private fun isSectionAdministrator(role: SectionAdministratorEntity): Boolean = role.active

    private fun hasSectionBusinessAuthority(subject: UUID, organization: UUID, section: UUID): Boolean =
        isClubAdministrator(subject, organization) || hasSectionRole(subject, organization, section)

    private fun hasSectionRole(subject: UUID, organization: UUID, section: UUID): Boolean =
        sectionAdmins.findBySectionIdAndSubject(section, subject)
            ?.let { isSectionAdministrator(it) && it.organizationId == organization } == true

    internal fun roles(actor: Actor): AdministrationRoleSnapshot {
        val clubRoles = clubAdmins.findBySubjectAndActiveTrue(actor.subject)
        val sectionRoles = sectionAdmins.findBySubjectAndActiveTrue(actor.subject).filter(::isSectionAdministrator)
        val teamRoles = teamAdmins.findBySubjectAndActiveTrue(actor.subject)
        val ownPeople = if (teamRoles.isEmpty()) emptySet() else
            people.people(actor).filter { it.kind == "self" }.map { it.organizationId to it.id }.toSet()
        val ownClubs = clubRoles.filter(::isClubAdministrator).map { it.organizationId }.toSet()
        return AdministrationRoleSnapshot(
            isPlatformAdministrator(actor.subject),
            ownClubs,
            sectionRoles.map { it.sectionId }.toSet(),
            ownClubs + sectionRoles.map { it.organizationId } + teamRoles.map { it.organizationId },
            teamRoles,
            ownPeople,
            clock.now(),
        )
    }

    internal fun currentTeamIds(roles: AdministrationRoleSnapshot, club: ClubEntity): Set<UUID> {
        val today = roles.referenceTime.atZone(ZoneId.of(club.timeZone)).toLocalDate()
        return roles.teamRoles.filter { role ->
            role.organizationId == club.id && isTeamAdministrator(role, today) {
                (role.organizationId to role.personId) in roles.ownPeople
            }
        }.map { it.teamId }.toSet()
    }

    private fun isTeamAdministrator(subject: UUID, team: AdministrationTeamEntity): Boolean {
        val role = teamAdmins.findByTeamIdAndSubject(requireNotNull(team.id), subject) ?: return false
        val club = clubs.findById(team.organizationId) ?: return false
        return isTeamAdministrator(role, today(club)) {
            directory.ownsPerson(subject, team.organizationId, role.personId)
        }
    }

    private fun isTeamAdministrator(role: TeamAdministratorEntity, today: LocalDate, ownsPerson: () -> Boolean): Boolean =
        role.active && role.startsOn <= today && (role.endsOn == null || role.endsOn >= today) && ownsPerson()

    private fun today(club: ClubEntity): LocalDate = clock.now().atZone(ZoneId.of(club.timeZone)).toLocalDate()

    private companion object {
        val ADMINISTRATOR_ROLES = setOf("owner", "admin")
    }
}

/** Operation-local facts for overview filtering; no per-team authorization lookups are needed. */
internal data class AdministrationRoleSnapshot(
    val platform: Boolean,
    val clubIds: Set<UUID>,
    val sectionIds: Set<UUID>,
    val organizationIds: Set<UUID>,
    val teamRoles: List<TeamAdministratorEntity>,
    val ownPeople: Set<Pair<UUID, UUID>>,
    val referenceTime: Instant,
)
