package se.forena.api.telegram

import java.util.UUID
import org.springframework.beans.factory.annotation.Value
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.access.AccessDeniedException
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import se.forena.api.activities.ActivityManagementService
import se.forena.api.activities.PersonalOverviewService
import se.forena.api.identity.*

data class TelegramGroup(
    val id: UUID,
    val teamId: UUID,
    val kind: String,
    val chatId: Long,
    val linkId: UUID,
    val inviteUrl: String,
)

data class GroupPairing(
    val fingerprint: String,
    val teamId: UUID,
    val kind: String,
    val linkId: UUID,
    val expiresAt: java.time.Instant,
)

data class GroupCommand(val kind: String)

data class GroupLink(val kind: String, val url: String)

data class GroupStart(val pairingUrl: String)

@Service
class TelegramGroupService(
    private val jdbc: JdbcClient,
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
    fun links(actor: Actor, team: UUID): List<GroupLink> {
        sessions.requireActive(actor)
        val entry =
            overview.overview(actor).teams.singleOrNull { it.id == team }
                ?: throw AccessDeniedException("Team access required")
        val leader = "leader" in entry.roles || management.canManageRoster(actor, team)
        return jdbc
            .sql("select * from forena.telegram_group where team_id=:team")
            .param("team", team)
            .query(TelegramGroup::class.java)
            .list()
            .map { requireNotNull(it) }
            .filter { group -> (group.kind == "team" || leader) && validOwner(group) }
            .map { GroupLink(it.kind, it.inviteUrl) }
    }

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
                jdbc
                    .sql(
                        "insert into forena.telegram_group_pairing(fingerprint,team_id,kind,link_id,expires_at) values(:hash,:team,:kind,:link,:expiry)"
                    )
                    .param("hash", identities.fingerprint(proof))
                    .param("team", team)
                    .param("kind", kind)
                    .param("link", link.id)
                    .param("expiry", java.sql.Timestamp.from(clock.now().plusSeconds(600)))
                    .update()
                GroupStart("https://t.me/$username?startgroup=g_$proof&admin=invite_users")
            }
        )

    fun disconnect(actor: Actor, team: UUID, kind: String) = transactions.executeWithoutResult {
        sessions.requireActive(actor)
        require(kind in listOf("team", "leaders"))
        if (!management.canManageRoster(actor, team))
            throw AccessDeniedException("Roster permission required")
        jdbc
            .sql("delete from forena.telegram_group where team_id=:team and kind=:kind")
            .param("team", team)
            .param("kind", kind)
            .update()
        jdbc
            .sql("delete from forena.telegram_group_pairing where team_id=:team and kind=:kind")
            .param("team", team)
            .param("kind", kind)
            .update()
    }

    fun message(user: Long, chat: Long, text: String) {
        if (chat >= 0) return
        val start = Regex("^/start(?:@[A-Za-z0-9_]+)? g_([A-Za-z0-9_-]{43})$").matchEntire(text)
        if (start != null) {
            connect(user, chat, start.groupValues[1])
            return
        }
        if (text != "/forena" && text != "/forena@$username") return
        val group =
            jdbc
                .sql("select * from forena.telegram_group where chat_id=:chat")
                .param("chat", chat)
                .query(TelegramGroup::class.java)
                .optional()
                .orElse(null) ?: return
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
            jdbc
                .sql(
                    "select * from forena.telegram_group_pairing where fingerprint=:hash and link_id=:link and expires_at>:now"
                )
                .param("hash", identities.fingerprint(proof))
                .param("link", link.id)
                .param("now", java.sql.Timestamp.from(clock.now()))
                .query(GroupPairing::class.java)
                .optional()
                .orElseThrow { AccessDeniedException("Invalid proof") }
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
                jdbc
                    .sql(
                        "delete from forena.telegram_group_pairing where fingerprint=:hash and link_id=:link and expires_at>:now"
                    )
                    .param("hash", identities.fingerprint(proof))
                    .param("link", link.id)
                    .param("now", java.sql.Timestamp.from(clock.now()))
                    .update() == 1
            )
            jdbc
                .sql(
                    "insert into forena.telegram_group(id,team_id,kind,chat_id,link_id,invite_url) values(:id,:team,:kind,:chat,:link,:url)"
                )
                .param("id", UUID.randomUUID())
                .param("team", pairing.teamId)
                .param("kind", pairing.kind)
                .param("chat", chat)
                .param("link", link.id)
                .param("url", url)
                .update()
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
            val connection =
                jdbc
                    .sql(
                        "select id,subject,telegram_user_id,chat_id,auth_version from forena.telegram_link where id=:id"
                    )
                    .param("id", group.linkId)
                    .query(TelegramConnection::class.java)
                    .optional()
                    .orElse(null)
            connection != null &&
                management.canManageRoster(identities.actor(connection), group.teamId)
        } catch (_: Exception) {
            false
        }

    fun removeChat(chat: Long) {
        jdbc
            .sql("delete from forena.telegram_group where chat_id=:chat")
            .param("chat", chat)
            .update()
    }
}
