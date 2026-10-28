package se.forena.api.assistant

import java.util.UUID
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import se.forena.api.activities.AssistantActivityService
import se.forena.api.identity.Actor
import se.forena.api.identity.AssistantIdentityService

data class AssistantDocument(
    val id: UUID,
    val title: String,
    val content: String,
    val audience: String,
)

data class AssistantDocuments(val documents: List<AssistantDocument>, val truncated: Boolean)

@Service
class AssistantDocumentService(
    private val jdbc: JdbcClient,
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
            jdbc
                .sql(
                    """select id,title,content,audience from forena.assistant_document
            where organization_id=:org and (section_id is null or section_id=:section) and (team_id is null or team_id=:team)
            and (audience='all' or (audience='players' and :player) or (audience='guardians' and :guardian) or (audience='leaders' and :leader))
            order by title,id limit 11"""
                )
                .param("org", organization)
                .param("team", team)
                .param("section", section)
                .param("player", "participant" in roles)
                .param("guardian", "guardian" in roles)
                .param("leader", "leader" in roles)
                .query(AssistantDocument::class.java)
                .list()
                .map { requireNotNull(it) }
        return AssistantDocuments(rows.take(10), rows.size > 10)
    }
}
