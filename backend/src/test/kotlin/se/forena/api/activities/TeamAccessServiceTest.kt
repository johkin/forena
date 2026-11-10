package se.forena.api.activities

import java.time.Instant
import java.time.LocalDate
import java.util.Optional
import java.util.UUID
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.EnumSource
import org.mockito.Mockito.doThrow
import org.mockito.Mockito.mock
import org.mockito.Mockito.times
import org.mockito.Mockito.verify
import org.mockito.Mockito.verifyNoInteractions
import org.mockito.Mockito.verifyNoMoreInteractions
import org.mockito.Mockito.`when`
import org.springframework.security.authentication.BadCredentialsException
import se.forena.api.activities.internal.ManagedActivityEntity
import se.forena.api.activities.internal.ManagedActivityRepository
import se.forena.api.activities.internal.ManagementRepository
import se.forena.api.activities.internal.ManagementTeamRow
import se.forena.api.identity.Actor
import se.forena.api.identity.DatabaseClockService
import se.forena.api.identity.SessionService

class TeamAccessServiceTest {
    private val repository = mock(ManagementRepository::class.java)
    private val sessions = mock(SessionService::class.java)
    private val clock = mock(DatabaseClockService::class.java)
    private val activities = mock(ManagedActivityRepository::class.java)
    private val access = TeamAccessService(repository, sessions, clock, activities)
    private val actor = Actor(UUID.randomUUID(), UUID.randomUUID(), "")
    private val team = ManagementTeamRow(
        UUID.randomUUID(), UUID.randomUUID(), "Lag", "Klubb", "Pacific/Kiritimati", null, null,
    )
    private val now = Instant.parse("2026-11-10T10:30:00Z")
    private val today = LocalDate.of(2026, 11, 11)
    private val activity = ManagedActivityEntity(
        UUID.randomUUID(), team.organizationId, team.id, null, "Träning", "", "Plan",
        now, now.plusSeconds(3600), null, null, null,
    )

    enum class Operation {
        BY_ID, LOADED_TEAM, CREATE, EDITOR, ROSTER, ACTIVITY, ATTENDANCE,
    }

    @ParameterizedTest
    @EnumSource(Operation::class)
    fun `each authorization delegation verifies the session and local clock only once`(operation: Operation) {
        val permission = when (operation) {
            Operation.ROSTER -> TeamPermission.MANAGE_ROSTER
            Operation.ATTENDANCE -> TeamPermission.MANAGE_ATTENDANCE
            else -> TeamPermission.MANAGE_ACTIVITIES
        }
        `when`(repository.team(team.id)).thenReturn(team)
        `when`(clock.now()).thenReturn(now)
        `when`(repository.allowed(actor.subject, team.organizationId, team.id, permission.key, today)).thenReturn(true)
        `when`(activities.findById(activity.activityId)).thenReturn(Optional.of(activity))

        val allowed = when (operation) {
            Operation.BY_ID -> access.allowed(actor, team.id, permission)
            Operation.LOADED_TEAM -> access.allowed(actor, team, permission)
            Operation.CREATE -> access.canCreateActivities(actor, team.id)
            Operation.EDITOR -> access.canOpenActivityEditor(actor, team.id)
            Operation.ROSTER -> access.canAdministerRoster(actor, team.id)
            Operation.ACTIVITY -> access.canManageActivity(actor, activity.activityId)
            Operation.ATTENDANCE -> access.canReportAttendance(actor, activity.activityId)
        }

        assertThat(allowed).isTrue()
        verify(sessions).requireActive(actor)
        verify(clock).now()
        verify(repository).allowed(actor.subject, team.organizationId, team.id, permission.key, today)
        if (operation != Operation.LOADED_TEAM) verify(repository).team(team.id)
        verifyNoMoreInteractions(sessions, clock, repository)
    }

    @Test
    fun `management access reads all permissions in one query without scalar permission calls`() {
        `when`(repository.team(team.id)).thenReturn(team)
        `when`(clock.now()).thenReturn(now)
        `when`(repository.permissions(actor.subject, team.organizationId, team.id, TeamPermission.keys, today))
            .thenReturn(listOf(TeamPermission.MANAGE_INVITATIONS.key, TeamPermission.MANAGE_ATTENDANCE.key))

        assertThat(access.hasAssistantManagementAccess(actor, team.id)).isTrue()

        verify(sessions).requireActive(actor)
        verify(clock).now()
        verify(repository).team(team.id)
        verify(repository).permissions(actor.subject, team.organizationId, team.id, TeamPermission.keys, today)
        verifyNoMoreInteractions(sessions, clock, repository)
    }

    @Test
    fun `permissions reuse a loaded team but are read afresh for every domain call`() {
        `when`(clock.now()).thenReturn(now)
        `when`(repository.permissions(actor.subject, team.organizationId, team.id, TeamPermission.keys, today))
            .thenReturn(listOf(TeamPermission.MANAGE_ROSTER.key), emptyList())

        assertThat(access.permissions(actor, team)).containsExactly(TeamPermission.MANAGE_ROSTER)
        assertThat(access.permissions(actor, team)).isEmpty()

        verify(sessions, times(2)).requireActive(actor)
        verify(clock, times(2)).now()
        verify(repository, times(2)).permissions(actor.subject, team.organizationId, team.id, TeamPermission.keys, today)
        verifyNoMoreInteractions(sessions, clock, repository)
    }

    @Test
    fun `missing teams retain the distinction between boolean checks and resource operations`() {
        assertThat(access.canManageRoster(actor, team.id)).isFalse()
        assertThat(access.permissions(actor, team.id)).isEmpty()
        assertThatThrownBy { access.canAdministerRoster(actor, team.id) }.isInstanceOf(NoSuchElementException::class.java)
        verifyNoInteractions(clock)
    }

    @Test
    fun `inactive identity is rejected before loading a team or evaluating any permissions`() {
        doThrow(BadCredentialsException("Inactive session")).`when`(sessions).requireActive(actor)

        assertThatThrownBy { access.permissions(actor, team.id) }.isInstanceOf(BadCredentialsException::class.java)

        verifyNoInteractions(repository, clock, activities)
    }
}
