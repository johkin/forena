package se.forena.api.assistant

import java.util.UUID
import java.util.stream.Stream
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertDoesNotThrow
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.Arguments
import org.junit.jupiter.params.provider.MethodSource
import org.springframework.security.access.AccessDeniedException
import se.forena.api.identity.Actor

class AssistantToolScopeTest {
    @ParameterizedTest(name = "{0}")
    @MethodSource("resourceBoundaries")
    fun `collection filters and direct reads enforce the same routed resource boundary`(
        description: String,
        scope: AssistantToolScope,
        organizationId: UUID,
        teamId: UUID,
        organizationAllowed: Boolean,
        teamAllowed: Boolean,
        resourceAllowed: Boolean,
    ) {
        assertThat(scope.includesOrganization(organizationId)).describedAs(description)
            .isEqualTo(organizationAllowed)
        assertThat(scope.includesTeam(teamId)).describedAs(description).isEqualTo(teamAllowed)
        assertThat(scope.includes(organizationId, teamId)).describedAs(description)
            .isEqualTo(resourceAllowed)

        if (organizationAllowed) {
            assertDoesNotThrow { scope.requireOrganization(organizationId) }
        } else {
            assertThrows<AccessDeniedException> { scope.requireOrganization(organizationId) }
        }
        if (teamAllowed) {
            assertDoesNotThrow { scope.requireTeam(teamId) }
        } else {
            assertThrows<AccessDeniedException> { scope.requireTeam(teamId) }
        }
        if (resourceAllowed) {
            assertDoesNotThrow { scope.requireResource(organizationId, teamId) }
        } else {
            assertThrows<AccessDeniedException> { scope.requireResource(organizationId, teamId) }
        }
    }

    @Test
    fun `server context preserves the verified actor and explicitly selected boundaries`() {
        val selected = AssistantToolScope.from(AssistantToolScope.context(actor, club, team))
        val unrestricted = AssistantToolScope.from(AssistantToolScope.context(actor))

        assertThat(selected.actor).isSameAs(actor)
        assertThat(selected.organizationId).isEqualTo(club)
        assertThat(selected.teamId).isEqualTo(team)
        assertThat(unrestricted.actor).isSameAs(actor)
        assertThat(unrestricted.organizationId).isNull()
        assertThat(unrestricted.teamId).isNull()
    }

    companion object {
        private val actor = Actor(UUID.randomUUID(), UUID.randomUUID(), "synthetic-tool-scope-credential")
        private val club = UUID.randomUUID()
        private val otherClub = UUID.randomUUID()
        private val team = UUID.randomUUID()
        private val otherTeam = UUID.randomUUID()
        private val ownResource = Resource("selected club and team", club, team)
        private val otherTeamResource = Resource("selected club, other team", club, otherTeam)
        private val otherClubResource = Resource("other club, selected team", otherClub, team)
        private val foreignResource = Resource("other club and team", otherClub, otherTeam)
        private val resources = listOf(ownResource, otherTeamResource, otherClubResource, foreignResource)

        @JvmStatic
        fun resourceBoundaries(): Stream<Arguments> {
            val boundaries = listOf(
                Boundary("unrestricted", null, null, setOf(club, otherClub), setOf(team, otherTeam), resources.toSet()),
                Boundary("club only", club, null, setOf(club), setOf(team, otherTeam), setOf(ownResource, otherTeamResource)),
                Boundary("team only", null, team, setOf(club, otherClub), setOf(team), setOf(ownResource, otherClubResource)),
                Boundary("club and team", club, team, setOf(club), setOf(team), setOf(ownResource)),
            )
            return boundaries.flatMap { boundary ->
                resources.map { resource ->
                    Arguments.of(
                        "${boundary.name}: ${resource.name}",
                        AssistantToolScope(actor, boundary.organizationId, boundary.teamId),
                        resource.organizationId,
                        resource.teamId,
                        resource.organizationId in boundary.allowedOrganizations,
                        resource.teamId in boundary.allowedTeams,
                        resource in boundary.allowedResources,
                    )
                }
            }.stream()
        }

        private data class Resource(val name: String, val organizationId: UUID, val teamId: UUID)

        private data class Boundary(
            val name: String,
            val organizationId: UUID?,
            val teamId: UUID?,
            val allowedOrganizations: Set<UUID>,
            val allowedTeams: Set<UUID>,
            val allowedResources: Set<Resource>,
        )
    }
}
