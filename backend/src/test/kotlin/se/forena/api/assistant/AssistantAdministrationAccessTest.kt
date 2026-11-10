package se.forena.api.assistant

import java.util.UUID
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatCode
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.mockito.Mockito.doThrow
import org.mockito.Mockito.mock
import org.mockito.Mockito.never
import org.mockito.Mockito.verify
import org.mockito.Mockito.verifyNoInteractions
import org.mockito.Mockito.`when`
import org.springframework.security.access.AccessDeniedException
import org.springframework.security.authentication.BadCredentialsException
import se.forena.api.activities.ActivityManagementService
import se.forena.api.activities.AssistantMember
import se.forena.api.activities.AssistantMemberService
import se.forena.api.activities.internal.AssistantMemberRepository
import se.forena.api.administration.AdministrationAccessService
import se.forena.api.assistant.internal.AssistantProfileRepository
import se.forena.api.identity.Actor
import se.forena.api.identity.AssistantIdentityService
import se.forena.api.identity.SessionService

class AssistantAdministrationAccessTest {
    private val sessions = mock(SessionService::class.java)
    private val administration = mock(AdministrationAccessService::class.java)
    private val management = mock(ActivityManagementService::class.java)
    private val identities = mock(AssistantIdentityService::class.java)
    private val profileRepository = mock(AssistantProfileRepository::class.java)
    private val memberRepository = mock(AssistantMemberRepository::class.java)
    private val profiles = AssistantProfileService(profileRepository, sessions, administration, management, identities)
    private val members = AssistantMemberService(memberRepository, sessions, administration, management)
    private val actor = Actor(UUID.randomUUID(), UUID.randomUUID(), "")
    private val organization = UUID.randomUUID()
    private val section = UUID.randomUUID()
    private val team = UUID.randomUUID()

    @Test
    fun `platform structure access does not authorize assistant profiles or member assignments`() {
        `when`(administration.isPlatformAdministrator(actor.subject)).thenReturn(true)

        assertThatThrownBy { profiles.requireAdmin(actor, organization) }
            .isInstanceOf(AccessDeniedException::class.java)
        assertThat(members.read(actor, organization, null, null)).isNull()

        verify(administration, never()).isPlatformAdministrator(actor.subject)
        verifyNoInteractions(profileRepository, memberRepository)
    }

    @Test
    fun `section profile administration delegates the organization boundary to the business policy`() {
        `when`(administration.canAdministerSectionBusiness(actor.subject, organization, section)).thenReturn(false)

        assertThatThrownBy { profiles.requireAdmin(actor, organization, section) }
            .isInstanceOf(AccessDeniedException::class.java)
            .hasMessage("Profile administration required")

        verify(administration).canAdministerSectionBusiness(actor.subject, organization, section)
        verifyNoInteractions(profileRepository)
    }

    @Test
    fun `section profile and member reads use the same explicit organization and section authority`() {
        `when`(administration.isSectionAdministrator(actor.subject, organization, section)).thenReturn(true)
        `when`(administration.canAdministerSectionBusiness(actor.subject, organization, section)).thenReturn(true)
        `when`(memberRepository.findAssignments(organization, null, true, section, false)).thenReturn(emptyList())
        `when`(memberRepository.countPeople(organization, null, true, section, false)).thenReturn(0)

        assertThatCode { profiles.requireAdmin(actor, organization, section) }.doesNotThrowAnyException()
        assertThat(members.read(actor, organization, null, section)?.uniquePeople).isZero()

        verify(administration).canAdministerSectionBusiness(actor.subject, organization, section)
        verify(memberRepository).findAssignments(organization, null, true, section, false)
        verify(memberRepository).countPeople(organization, null, true, section, false)
        verifyNoInteractions(management)
    }

    @Test
    fun `team memory still requires its named permission and matching organization scope`() {
        val draft = MemoryDraft("team", organization, section, team, content = "Samling vid entrén.")
        `when`(administration.isClubAdministrator(actor.subject, organization)).thenReturn(true)

        assertThatThrownBy { profiles.validateMemory(actor, draft) }
            .isInstanceOf(AccessDeniedException::class.java)
        verifyNoInteractions(profileRepository, administration)

        `when`(management.canManageMemory(actor, team)).thenReturn(true)
        `when`(profileRepository.teamMatchesScope(team, organization, false, section)).thenReturn(false)

        assertThatThrownBy { profiles.validateMemory(actor, draft) }
            .isInstanceOf(IllegalArgumentException::class.java)
        verify(profileRepository).teamMatchesScope(team, organization, false, section)
    }

    @Test
    fun `personal memory cannot carry organization or team authority`() {
        assertThatCode { profiles.validateMemory(actor, MemoryDraft(content = "Korta svar.")) }
            .doesNotThrowAnyException()
        assertThatThrownBy {
            profiles.validateMemory(actor, MemoryDraft(organizationId = organization, content = "Korta svar."))
        }.isInstanceOf(IllegalArgumentException::class.java)

        verifyNoInteractions(administration, management, profileRepository)
    }

    @Test
    fun `team roster permission grants only the requested member scope and retains result bounds`() {
        val assignments = List(201) { index ->
            AssistantMember(UUID.randomUUID(), "Deltagare $index", team, "Testlaget", "participant", null)
        }
        `when`(management.canManageRoster(actor, team)).thenReturn(true)
        `when`(memberRepository.findAssignments(organization, team, false, section, false)).thenReturn(assignments)
        `when`(memberRepository.countPeople(organization, team, false, section, false)).thenReturn(201)

        val result = members.read(actor, organization, team, section)

        assertThat(result?.uniquePeople).isEqualTo(201L)
        assertThat(result?.assignments).hasSize(200)
        assertThat(result?.truncated).isTrue()
        verify(administration).isClubAdministrator(actor.subject, organization)
        verify(administration).isSectionAdministrator(actor.subject, organization, section)
        verify(memberRepository).findAssignments(organization, team, false, section, false)
    }

    @Test
    fun `unauthorized member read returns no data and does not query assignments`() {
        assertThat(members.read(actor, organization, team, section)).isNull()

        verifyNoInteractions(memberRepository)
    }

    @Test
    fun `revoked session is rejected before central role facts or profile and member data`() {
        doThrow(BadCredentialsException("Session revoked")).`when`(sessions).requireActive(actor)

        assertThatThrownBy { profiles.requireAdmin(actor, organization, section) }
            .isInstanceOf(BadCredentialsException::class.java)
        assertThatThrownBy { members.read(actor, organization, team, section) }
            .isInstanceOf(BadCredentialsException::class.java)

        verifyNoInteractions(administration, management, profileRepository, memberRepository)
    }
}
