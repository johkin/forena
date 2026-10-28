package se.forena.api.assistant

import java.util.UUID
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import se.forena.api.activities.AssistantActivityService
import se.forena.api.assistant.internal.AssistantDocumentRepository
import se.forena.api.identity.Actor
import se.forena.api.identity.AssistantIdentityService

@Service
class AssistantDocumentService(
    private val repository: AssistantDocumentRepository,
    private val profiles: AssistantProfileService,
    private val identities: AssistantIdentityService,
    private val activities: AssistantActivityService,
) {
    @Transactional(readOnly = true)
    fun read(actor: Actor, organization: UUID, team: UUID?, section: UUID?): AssistantDocuments {
        profiles.requireOrganization(actor, organization)
        if (team != null) require(activities.team(actor, team).organizationId == organization)
        val roles = identities.viewer(actor, organization, team).roles
        val rows =
            repository.findVisibleDocuments(
                organization,
                team,
                section,
                "participant" in roles,
                "guardian" in roles,
                "leader" in roles,
            )
        return AssistantDocuments(rows.take(10), rows.size > 10)
    }
}
