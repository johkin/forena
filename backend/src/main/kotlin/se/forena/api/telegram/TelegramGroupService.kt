package se.forena.api.telegram

import java.util.UUID
import org.springframework.beans.factory.annotation.Value
import org.springframework.security.access.AccessDeniedException
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.support.TransactionTemplate
import se.forena.api.activities.ActivityManagementService
import se.forena.api.activities.PersonalOverviewService
import se.forena.api.identity.*
import se.forena.api.telegram.internal.TelegramGroupRepository

@Service
class TelegramGroupService(
    private val repository: TelegramGroupRepository,
    private val identities: TelegramIdentityService,
    private val management: ActivityManagementService,
    private val overview: PersonalOverviewService,
    private val client: TelegramClient,
    private val transactions: TransactionTemplate,
    private val clock: DatabaseClockService,
    private val sessions: SessionService,
    private val web: BrowserSessionSettings,
    @Value("\${FORENA_TELEGRAM_BOT_USERNAME:}") private val username: String,
) {
    fun knownChat(chat: Long): Boolean = repository.findByChat(chat).isPresent

    @Transactional(readOnly = true)
    fun acceptsMessage(user: Long, chat: Long, text: String): Boolean {
        if (chat >= 0) return false
        val link = identities.connection(user, user) ?: return false
        val actor = identities.actor(link)
        val start = Regex("^/start(?:@[A-Za-z0-9_]+)? g_([A-Za-z0-9_-]{43})$").matchEntire(text)
        if (start != null) {
            val pairing =
                repository
                    .findPairing(identities.fingerprint(start.groupValues[1]), link.id, clock.now())
                    .orElse(null) ?: return false
            return management.canManageRoster(actor, pairing.teamId)
        }
        if (text != "/forena" && text != "/forena@$username") return false
        return repository.findByChat(chat).orElse(null)?.let { validOwner(it) } == true
    }

    fun links(actor: Actor, team: UUID): List<GroupLink> {
        sessions.requireActive(actor)
        val entry =
            overview.overview(actor).teams.singleOrNull { it.id == team }
                ?: throw AccessDeniedException("Team access required")
        val leader = "leader" in entry.roles || management.canManageRoster(actor, team)
        return repository
            .findForTeam(team)
            .filter { group -> (group.kind == "team" || leader) && validOwner(group) }
            .map { GroupLink(it.kind, it.inviteUrl) }
    }

    @PreAuthorize("@teamAccess.canManageRoster(#actor, #team)")
    fun start(actor: Actor, team: UUID, kind: String): GroupStart =
        requireNotNull(
            transactions.execute {
                sessions.requireActive(actor)
                require(kind in listOf("team", "leaders"))
                if (!management.canManageRoster(actor, team))
                    throw AccessDeniedException("Roster permission required")
                val link =
                    identities.connectionForSubject(actor.subject)
                        ?: throw IllegalStateException("Connect Telegram first")
                identities.actor(link)
                val proof = identities.proof()
                repository.createPairing(
                    identities.fingerprint(proof),
                    team,
                    kind,
                    link.id,
                    clock.now().plusSeconds(600),
                )
                GroupStart("https://t.me/$username?startgroup=g_$proof&admin=invite_users")
            }
        )

    @PreAuthorize("@teamAccess.canManageRoster(#actor, #team)")
    fun disconnect(actor: Actor, team: UUID, kind: String) = transactions.executeWithoutResult {
        sessions.requireActive(actor)
        require(kind in listOf("team", "leaders"))
        if (!management.canManageRoster(actor, team))
            throw AccessDeniedException("Roster permission required")
        repository.deleteForTeam(team, kind)
        repository.deletePairingsForTeam(team, kind)
    }

    fun message(user: Long, chat: Long, text: String) {
        if (chat >= 0) return
        val start = Regex("^/start(?:@[A-Za-z0-9_]+)? g_([A-Za-z0-9_-]{43})$").matchEntire(text)
        if (start != null) {
            connect(user, chat, start.groupValues[1])
            return
        }
        if (text != "/forena" && text != "/forena@$username") return
        val group = repository.findByChat(chat).orElse(null) ?: return
        if (!validOwner(group)) return
        client.call(
            "sendMessage",
            mapOf(
                "chat_id" to chat,
                "text" to "Öppna laget i Förena. Logga in för att se det du har behörighet till.",
                "reply_markup" to
                    mapOf(
                        "inline_keyboard" to
                            listOf(
                                listOf(
                                    TelegramButton(
                                        "Öppna Förena",
                                        url = "${web.origin}/teams/${group.teamId}",
                                    )
                                )
                            )
                    ),
            ),
        )
    }

    private fun connect(user: Long, chat: Long, proof: String) {
        val link =
            identities.connection(user, user)
                ?: throw AccessDeniedException("Verified identity required")
        val actor = identities.actor(link)
        val pairing =
            requireNotNull(
                transactions.execute {
                    repository
                        .findPairing(identities.fingerprint(proof), link.id, clock.now())
                        .orElseThrow { AccessDeniedException("Invalid proof") }
                }
            )
        if (!management.canManageRoster(actor, pairing.teamId))
            throw AccessDeniedException("Roster permission required")
        val status =
            client
                .call("getChatMember", mapOf("chat_id" to chat, "user_id" to user))
                .path("status")
                .asText()
        check(status in listOf("creator", "administrator"))
        val bot = client.call("getMe", emptyMap()).path("id").asLong()
        val botMember = client.call("getChatMember", mapOf("chat_id" to chat, "user_id" to bot))
        check(
            botMember.path("status").asText() == "administrator" &&
                botMember.path("can_invite_users").asBoolean()
        )
        val invite =
            client.call(
                "createChatInviteLink",
                mapOf("chat_id" to chat, "creates_join_request" to true),
            )
        check(invite.path("creates_join_request").asBoolean())
        val url = invite.path("invite_link").asText()
        require(url.matches(Regex("https://t\\.me/[A-Za-z0-9_+/-]+")))
        transactions.executeWithoutResult {
            identities.actor(link)
            check(management.canManageRoster(actor, pairing.teamId))
            check(
                repository.consumePairing(identities.fingerprint(proof), link.id, clock.now()) == 1
            )
            repository.insertGroup(
                UUID.randomUUID(),
                pairing.teamId,
                pairing.kind,
                chat,
                link.id,
                url,
            )
        }
        client.call(
            "sendMessage",
            mapOf(
                "chat_id" to chat,
                "text" to
                    "Gruppen är kopplad till Förena. /forena öppnar laget. Privata frågor och registrering hanteras i botens privata chatt.",
            ),
        )
    }

    private fun validOwner(group: TelegramGroup): Boolean =
        try {
            val connection = repository.findOwnerConnection(group.linkId).orElse(null)
            connection != null &&
                management.canManageRoster(identities.actor(connection), group.teamId)
        } catch (_: Exception) {
            false
        }

    fun removeChat(chat: Long) {
        repository.deleteByChat(chat)
    }
}
