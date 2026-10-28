package se.forena.api.telegram

import java.util.UUID
import org.springframework.security.access.AccessDeniedException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import se.forena.api.activities.*
import se.forena.api.identity.*
import se.forena.api.telegram.internal.TelegramInvitationRepository

@Service
class TelegramInvitationService(
    private val repository: TelegramInvitationRepository,
    private val identities: TelegramIdentityService,
    private val activities: AssistantActivityService,
    private val invitations: InvitationService,
) {
    fun activityForReply(connection: TelegramConnection, message: Long): UUID? {
        val row = repository.findByReply(connection.id, message).orElse(null) ?: return null
        return activities.invitationState(identities.actor(connection), row.invitationId).activityId
    }

    @Transactional
    fun respond(
        connection: TelegramConnection,
        message: Long,
        id: UUID,
        accepted: Boolean,
        update: Long,
    ): String {
        val actor = identities.actor(connection)
        val identity =
            repository.findByCallback(id, connection.id, message).orElseThrow {
                AccessDeniedException("Unavailable button")
            }
        val initial = activities.invitationState(actor, identity.invitationId)
        activities.lockActivity(actor, initial.activityId)
        val row = repository.findLocked(id, connection.id)
        val current = activities.invitationState(actor, row.invitationId)
        check(
            update > row.lastUpdate &&
                current.activityRevision == row.activityRevision &&
                current.invitationRevision == row.invitationRevision
        )
        val response = if (accepted) "accepted" else "declined"
        activities.respond(
            actor,
            listOf(current.invitationId to ResponseChange(response, false, null)),
            mapOf(current.invitationId to current.invitationRevision),
            invitations,
        )
        val after = activities.invitationState(actor, current.invitationId)
        repository.advanceRevision(after.invitationRevision, update, id)
        return "${current.personName} ${if (accepted) "kommer" else "kan inte komma"}."
    }

    fun receipt(connection: TelegramConnection, id: UUID): TelegramReceipt {
        val row = repository.findForConnection(id, connection.id)
        val state = activities.invitationState(identities.actor(connection), row.invitationId)
        val body = repository.notificationBody(row.notificationId)
        return TelegramReceipt(body, state.activityId, state.response)
    }
}
