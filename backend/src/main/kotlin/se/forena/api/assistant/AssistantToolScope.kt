package se.forena.api.assistant

import java.util.UUID
import org.springframework.ai.chat.model.ToolContext
import org.springframework.security.access.AccessDeniedException
import org.springframework.security.authentication.BadCredentialsException
import se.forena.api.identity.Actor

/** Verified identity and routing boundaries, supplied by the caller rather than tool arguments. */
data class AssistantToolScope(
    val actor: Actor,
    val organizationId: UUID? = null,
    val teamId: UUID? = null,
) {
    fun includesOrganization(id: UUID): Boolean = organizationId == null || organizationId == id

    fun includesTeam(id: UUID): Boolean = teamId == null || teamId == id

    fun includes(organization: UUID, team: UUID): Boolean =
        includesOrganization(organization) && includesTeam(team)

    fun requireOrganization(id: UUID) {
        if (!includesOrganization(id))
            throw AccessDeniedException("Organization outside tool scope")
    }

    fun requireTeam(id: UUID) {
        if (!includesTeam(id))
            throw AccessDeniedException("Team outside tool scope")
    }

    fun requireResource(organization: UUID, team: UUID) {
        requireOrganization(organization)
        requireTeam(team)
    }

    companion object {
        private const val CONTEXT_KEY = "forena.tool.scope"

        fun context(actor: Actor, organizationId: UUID? = null, teamId: UUID? = null): ToolContext =
            ToolContext(mapOf(CONTEXT_KEY to AssistantToolScope(actor, organizationId, teamId)))

        fun from(context: ToolContext): AssistantToolScope =
            context.context[CONTEXT_KEY] as? AssistantToolScope
                ?: throw BadCredentialsException("Missing tool identity")
    }
}
