package se.forena.api.administration

import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.CsvSource
import org.mockito.Mockito.clearInvocations
import org.mockito.Mockito.mock
import org.mockito.Mockito.verify
import org.mockito.Mockito.verifyNoInteractions
import org.mockito.Mockito.`when`
import se.forena.api.administration.internal.AdministrationTeamEntity
import se.forena.api.administration.internal.AdministrationTeamRepository
import se.forena.api.administration.internal.ClubAdministratorEntity
import se.forena.api.administration.internal.ClubAdministratorRepository
import se.forena.api.administration.internal.ClubEntity
import se.forena.api.administration.internal.ClubRepository
import se.forena.api.administration.internal.PlatformAdministratorRepository
import se.forena.api.administration.internal.SectionAdministratorEntity
import se.forena.api.administration.internal.SectionAdministratorRepository
import se.forena.api.administration.internal.SectionEntity
import se.forena.api.administration.internal.SectionRepository
import se.forena.api.administration.internal.TeamAdministratorEntity
import se.forena.api.administration.internal.TeamAdministratorRepository
import se.forena.api.identity.AccessiblePerson
import se.forena.api.identity.Actor
import se.forena.api.identity.AdministrationDirectory
import se.forena.api.identity.DatabaseClockService
import se.forena.api.identity.PersonAccessService

class AdministrationAccessServiceTest {
    private val platforms = mock(PlatformAdministratorRepository::class.java)
    private val clubs = mock(ClubRepository::class.java)
    private val sections = mock(SectionRepository::class.java)
    private val teams = mock(AdministrationTeamRepository::class.java)
    private val clubAdmins = mock(ClubAdministratorRepository::class.java)
    private val sectionAdmins = mock(SectionAdministratorRepository::class.java)
    private val teamAdmins = mock(TeamAdministratorRepository::class.java)
    private val directory = mock(AdministrationDirectory::class.java)
    private val people = mock(PersonAccessService::class.java)
    private val clock = mock(DatabaseClockService::class.java)
    private val access = AdministrationAccessService(
        platforms, clubs, sections, teams, clubAdmins, sectionAdmins, teamAdmins, directory, people, clock
    )
    private val subject = UUID.randomUUID()
    private val actor = Actor(subject, UUID.randomUUID(), "")
    private val organizationId = UUID.randomUUID()
    private val sectionId = UUID.randomUUID()
    private val teamId = UUID.randomUUID()
    private val personId = UUID.randomUUID()
    private val club = ClubEntity(organizationId, "Testföreningen", "test", "Europe/Stockholm")
    private val section = SectionEntity(sectionId, organizationId, "Fotboll", "football", "football")
    private val team = AdministrationTeamEntity(teamId, organizationId, sectionId, "Testlaget", "testlaget", "2026")
    // It is November 11 in Stockholm, while the UTC date is still November 10.
    private val now = Instant.parse("2026-11-10T23:30:00Z")
    private val today = LocalDate.parse("2026-11-11")

    @Test
    fun `platform administration grants structure access without granting business access`() {
        `when`(platforms.existsById(subject)).thenReturn(true)
        `when`(sections.findById(sectionId)).thenReturn(section)
        `when`(teams.findById(teamId)).thenReturn(team)

        assertThat(access.isPlatformAdministrator(subject)).isTrue()
        assertThat(access.canAdministerClubStructure(subject, organizationId)).isTrue()
        assertThat(access.canAdministerSectionStructure(subject, organizationId, sectionId)).isTrue()
        assertThat(access.canAdministerTeamStructure(subject, teamId)).isTrue()
        assertThat(access.canAdministerSectionBusiness(subject, organizationId, sectionId)).isFalse()
        assertThat(access.canAdministerTeamBusiness(subject, teamId)).isFalse()
    }

    @ParameterizedTest
    @CsvSource(
        "owner, true, true", "admin, true, true", "owner, false, false", "admin, false, false",
        "leader, true, false", "member, true, false", "team_administrator, true, false"
    )
    fun `only active club owner or admin grants club and inherited business access`(
        roleName: String, active: Boolean, allowed: Boolean
    ) {
        val role = ClubAdministratorEntity(UUID.randomUUID(), organizationId, subject, roleName, active)
        `when`(clubAdmins.findByOrganizationIdAndSubject(organizationId, subject)).thenReturn(role)
        `when`(sections.findById(sectionId)).thenReturn(section)
        `when`(teams.findById(teamId)).thenReturn(team)

        assertThat(access.isClubAdministrator(subject, organizationId)).isEqualTo(allowed)
        assertThat(access.canAdministerClubStructure(subject, organizationId)).isEqualTo(allowed)
        assertThat(access.canAdministerSectionBusiness(subject, organizationId, sectionId)).isEqualTo(allowed)
        assertThat(access.canAdministerTeamBusiness(subject, teamId)).isEqualTo(allowed)
    }

    @Test
    fun `missing role never grants administration`() {
        assertThat(access.isPlatformAdministrator(subject)).isFalse()
        assertThat(access.isClubAdministrator(subject, organizationId)).isFalse()
        assertThat(access.isSectionAdministrator(subject, organizationId, sectionId)).isFalse()
        assertThat(access.isTeamAdministrator(subject, teamId)).isFalse()
        assertThat(access.canAdministerClubStructure(subject, organizationId)).isFalse()
        assertThat(access.canAdministerSectionStructure(subject, organizationId, sectionId)).isFalse()
        assertThat(access.canAdministerSectionBusiness(subject, organizationId, sectionId)).isFalse()
    }

    @Test
    fun `section role must be active and agree with the section actual organization`() {
        val role = SectionAdministratorEntity(UUID.randomUUID(), organizationId, sectionId, subject, true)
        `when`(sections.findById(sectionId)).thenReturn(section)
        `when`(sectionAdmins.findBySectionIdAndSubject(sectionId, subject)).thenReturn(role)
        `when`(teams.findById(teamId)).thenReturn(team)

        assertThat(access.isSectionAdministrator(subject, organizationId, sectionId)).isTrue()
        assertThat(access.canAdministerSectionBusiness(subject, organizationId, sectionId)).isTrue()
        assertThat(access.canAdministerTeamBusiness(subject, teamId)).isTrue()

        `when`(sectionAdmins.findBySectionIdAndSubject(sectionId, subject)).thenReturn(role.copy(active = false))
        assertThat(access.isSectionAdministrator(subject, organizationId, sectionId)).isFalse()
        assertThat(access.canAdministerSectionBusiness(subject, organizationId, sectionId)).isFalse()

        `when`(sectionAdmins.findBySectionIdAndSubject(sectionId, subject))
            .thenReturn(role.copy(organizationId = UUID.randomUUID()))
        assertThat(access.isSectionAdministrator(subject, organizationId, sectionId)).isFalse()

        `when`(sectionAdmins.findBySectionIdAndSubject(sectionId, subject)).thenReturn(role)
        `when`(sections.findById(sectionId)).thenReturn(section.copy(organizationId = UUID.randomUUID()))
        assertThat(access.isSectionAdministrator(subject, organizationId, sectionId)).isFalse()
        assertThat(access.canAdministerSectionBusiness(subject, organizationId, sectionId)).isFalse()
        `when`(sections.findById(sectionId)).thenReturn(null)
        assertThat(access.isSectionAdministrator(subject, organizationId, sectionId)).isFalse()
    }

    @Test
    fun `platform and club authority cannot attach a foreign section to the requested club`() {
        `when`(platforms.existsById(subject)).thenReturn(true)
        `when`(clubAdmins.findByOrganizationIdAndSubject(organizationId, subject))
            .thenReturn(ClubAdministratorEntity(UUID.randomUUID(), organizationId, subject, "owner", true))
        `when`(sections.findById(sectionId)).thenReturn(section.copy(organizationId = UUID.randomUUID()))

        assertThat(access.canAdministerSectionStructure(subject, organizationId, sectionId)).isFalse()
        assertThat(access.canAdministerSectionBusiness(subject, organizationId, sectionId)).isFalse()
    }

    @Test
    fun `section role and policies validate the organization relationship once per decision`() {
        `when`(sections.findById(sectionId)).thenReturn(section)
        `when`(sectionAdmins.findBySectionIdAndSubject(sectionId, subject))
            .thenReturn(SectionAdministratorEntity(UUID.randomUUID(), organizationId, sectionId, subject, true))
        val decisions = listOf<() -> Boolean>(
            { access.isSectionAdministrator(subject, organizationId, sectionId) },
            { access.canAdministerSectionStructure(subject, organizationId, sectionId) },
            { access.canAdministerSectionBusiness(subject, organizationId, sectionId) },
        )

        decisions.forEach { decide ->
            clearInvocations(sections)
            assertThat(decide()).isTrue()
            verify(sections).findById(sectionId)
        }
    }

    @ParameterizedTest
    @CsvSource(
        "2026-11-11, 2026-11-11, true, true, true",
        "2026-11-01, 2026-11-11, true, true, true",
        "2026-11-12, 2026-11-20, true, true, false",
        "2026-11-01, 2026-11-10, true, true, false",
        "2026-11-11, 2026-11-11, false, true, false",
        "2026-11-11, 2026-11-11, true, false, false"
    )
    fun `team administration requires active inclusive club local dates and own person`(
        startsOn: LocalDate, endsOn: LocalDate, active: Boolean, ownsPerson: Boolean, allowed: Boolean
    ) {
        `when`(teams.findById(teamId)).thenReturn(team)
        `when`(clubs.findById(organizationId)).thenReturn(club)
        `when`(clock.now()).thenReturn(now)
        `when`(teamAdmins.findByTeamIdAndSubject(teamId, subject))
            .thenReturn(teamRole(starts = startsOn, ends = endsOn, active = active))
        `when`(directory.ownsPerson(subject, organizationId, personId)).thenReturn(ownsPerson)

        assertThat(access.isTeamAdministrator(subject, teamId)).isEqualTo(allowed)
        assertThat(access.canAdministerTeamBusiness(subject, teamId)).isEqualTo(allowed)
    }

    @Test
    fun `team administration may be open ended but still requires an existing club`() {
        `when`(teams.findById(teamId)).thenReturn(team)
        `when`(teamAdmins.findByTeamIdAndSubject(teamId, subject)).thenReturn(teamRole(ends = null))
        `when`(clubs.findById(organizationId)).thenReturn(club)
        `when`(clock.now()).thenReturn(now)
        `when`(directory.ownsPerson(subject, organizationId, personId)).thenReturn(true)

        assertThat(access.isTeamAdministrator(subject, teamId)).isTrue()

        `when`(clubs.findById(organizationId)).thenReturn(null)
        assertThat(access.isTeamAdministrator(subject, teamId)).isFalse()
    }

    @Test
    fun `overview snapshot enforces role dates and own person scope without per team lookups`() {
        val guardianPerson = UUID.randomUUID()
        val wrongClubPerson = UUID.randomUUID()
        val otherOrganization = UUID.randomUUID()
        val current = teamRole()
        val inactive = teamRole(team = UUID.randomUUID(), active = false)
        val future = teamRole(team = UUID.randomUUID(), starts = today.plusDays(1))
        val expired = teamRole(team = UUID.randomUUID(), starts = today.minusDays(3), ends = today.minusDays(1))
        val delegated = teamRole(team = UUID.randomUUID(), person = guardianPerson)
        val wrongClub = teamRole(team = UUID.randomUUID(), person = wrongClubPerson)
        val otherClub = teamRole(team = UUID.randomUUID(), organization = otherOrganization)
        val owner = ClubAdministratorEntity(UUID.randomUUID(), organizationId, subject, "owner", true)
        val inactiveAdmin = owner.copy(id = UUID.randomUUID(), organizationId = UUID.randomUUID(), active = false)
        val member = owner.copy(id = UUID.randomUUID(), organizationId = UUID.randomUUID(), role = "member")
        val activeSection = SectionAdministratorEntity(UUID.randomUUID(), organizationId, sectionId, subject, true)
        val inactiveSection = activeSection.copy(id = UUID.randomUUID(), sectionId = UUID.randomUUID(), active = false)
        `when`(clubAdmins.findBySubjectAndActiveTrue(subject)).thenReturn(listOf(owner, inactiveAdmin, member))
        `when`(sectionAdmins.findBySubjectAndActiveTrue(subject)).thenReturn(listOf(activeSection, inactiveSection))
        `when`(teamAdmins.findBySubjectAndActiveTrue(subject))
            .thenReturn(listOf(current, inactive, future, expired, delegated, wrongClub, otherClub))
        `when`(people.people(actor)).thenReturn(listOf(
            AccessiblePerson(personId, "Egen person", organizationId, "self"),
            AccessiblePerson(guardianPerson, "Barn", organizationId, "guardian"),
            AccessiblePerson(wrongClubPerson, "Person i annan klubb", otherOrganization, "self"),
        ))
        `when`(clock.now()).thenReturn(now)

        val snapshot = access.roles(actor)

        assertThat(snapshot.clubIds).containsExactly(organizationId)
        assertThat(snapshot.sectionIds).containsExactly(sectionId)
        assertThat(access.currentTeamIds(snapshot, club)).containsExactly(teamId)
        verify(people).people(actor)
        verify(clock).now()
        clearInvocations(platforms, clubs, sections, teams, clubAdmins, sectionAdmins, teamAdmins, directory, people, clock)

        // Reusing the snapshot remains consistent even if the wall clock advances past the final day.
        `when`(clock.now()).thenReturn(now.plusSeconds(86400))
        clearInvocations(clock)
        repeat(3) {
            assertThat(access.currentTeamIds(snapshot, club)).containsExactly(teamId)
        }

        verifyNoInteractions(platforms, clubs, sections, teams, clubAdmins, sectionAdmins, teamAdmins, directory, people, clock)
    }

    private fun teamRole(
        team: UUID = teamId,
        organization: UUID = organizationId,
        person: UUID = personId,
        starts: LocalDate = today,
        ends: LocalDate? = today,
        active: Boolean = true,
    ) = TeamAdministratorEntity(
        UUID.randomUUID(), organization, team, subject, person, UUID.randomUUID(), starts, ends, active
    )
}
