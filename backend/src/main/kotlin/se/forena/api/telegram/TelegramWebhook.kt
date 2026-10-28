package se.forena.api.telegram

import jakarta.servlet.http.HttpServletRequest
import java.util.UUID
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.security.authentication.BadCredentialsException
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RestController
import se.forena.api.assistant.*
import se.forena.api.identity.*
import se.forena.api.telegram.internal.TelegramWebhookRepository
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper

@Service
class TelegramWebhookService(
    private val repository: TelegramWebhookRepository,
    private val transactions: TransactionTemplate,
    private val identities: TelegramIdentityService,
    private val assistant: AssistantService,
    private val proposals: AssistantProposalService,
    private val telegram: TelegramClient,
    private val voice: VoiceTranscriber,
    private val callbacks: TelegramInvitationService,
    private val groups: TelegramGroupService,
    private val web: BrowserSessionSettings,
) {
    fun handle(update: JsonNode) {
        val id = update.path("update_id").asLong(-1)
        require(id >= 0)
        if (!accepts(update)) return
        val admitted =
            transactions.execute {
                repository.claimUpdate(id) == 1
            } == true
        if (!admitted) return
        try {
            when {
                update.has("callback_query") -> callback(id, update.path("callback_query"))
                update.has("message") -> message(id, update.path("message"))
                update.has("my_chat_member") -> membership(id, update.path("my_chat_member"))
            }
            finish(id, "completed")
        } catch (_: Exception) {
            finish(id, "failed")
            // A failed update is not replayed: an HTTP send or a command may already have
            // succeeded.
            // The user can send a new message; proposals and business commands remain
            // transactional.
        }
    }

    private fun accepts(update: JsonNode): Boolean =
        try {
            when {
                update.has("callback_query") -> {
                    val callback = update.path("callback_query")
                    val user = callback.path("from").path("id").asLong(-1)
                    val chat = callback.path("message").path("chat")
                    !callback.path("from").path("is_bot").asBoolean() &&
                        chat.path("type").asText("") == "private" &&
                        user > 0 &&
                        user == chat.path("id").asLong() &&
                        identities.acceptsSender(user)
                }
                update.has("message") -> acceptsMessage(update.path("message"))
                update.has("my_chat_member") -> {
                    val chat = update.path("my_chat_member").path("chat")
                    val id = chat.path("id").asLong()
                    if (chat.path("type").asText("") == "private")
                        id > 0 && identities.acceptsSender(id)
                    else groups.knownChat(id)
                }
                else -> false
            }
        } catch (_: BadCredentialsException) {
            false
        }

    private fun acceptsMessage(message: JsonNode): Boolean {
        val chat = message.path("chat")
        val id = chat.path("id").asLong()
        if (message.has("migrate_to_chat_id") || message.has("migrate_from_chat_id"))
            return groups.knownChat(id)
        val sender = message.path("from")
        val user = sender.path("id").asLong(-1)
        if (user <= 0 || sender.path("is_bot").asBoolean()) return false
        val text = message.path("text").asText("")
        if (chat.path("type").asText("") != "private") {
            if (chat.path("type").asText("") !in setOf("group", "supergroup")) return false
            return groups.acceptsMessage(user, id, text)
        }
        if (id != user) return false
        if (text.startsWith("/start "))
            return identities.acceptsPairing(text.removePrefix("/start ").trim())
        return identities.acceptsSender(user)
    }

    private fun message(update: Long, message: JsonNode) {
        val chat = message.path("chat")
        val sender = message.path("from")
        val text = message.path("text").asText("")
        val user = sender.path("id").asLong()
        val chatId = chat.path("id").asLong()
        if (message.has("migrate_to_chat_id") || message.has("migrate_from_chat_id")) {
            groups.removeChat(chatId)
            return
        }
        if (sender.path("is_bot").asBoolean()) return
        if (chat.path("type").asText() != "private") {
            // Group free text/voice never reaches the assistant or a private account resolver.
            groups.message(user, chatId, text)
            return
        }
        if (user <= 0 || user != chatId) return
        if (text.startsWith("/start ")) {
            try {
                identities.connect(text.removePrefix("/start ").trim(), user, chatId, update)
                send(
                    chatId,
                    "Telegram är kopplat. Du kan svara på privata kallelser och fråga Förena-assistenten.",
                )
            } catch (_: Exception) {
                send(
                    chatId,
                    "Länken kan inte användas. Skapa en ny länk från Telegram-inställningarna i Förena.",
                )
            }
            return
        }
        val connection = identities.connection(user, chatId)
        if (connection == null) {
            send(
                chatId,
                "Koppla ditt konto i Förena för att använda boten.",
                listOf(
                    listOf(
                        TelegramButton("Koppla till Förena", url = "${web.origin}/account#telegram")
                    )
                ),
            )
            return
        }
        if (!identities.advance(connection, update)) return
        val actor = identities.actor(connection)
        when (text.trim().lowercase()) {
            "/stop" -> {
                identities.disconnect(connection.subject)
                send(
                    chatId,
                    "Telegram är bortkopplat. Gamla knappar och förslag kan inte användas.",
                )
                return
            }
            "/new",
            "/new@forena",
            "nytt samtal" -> {
                assistant.new(actor)
                send(
                    chatId,
                    "Ett nytt Telegram-samtal har startats. Tidigare samtal och sparade minnen finns kvar i Förena.",
                )
                return
            }
            "/start",
            "/help" -> {
                send(
                    chatId,
                    "Skriv din fråga här. Ange lag och aktivitet när det behövs. Text- och röstsvar granskas före knappbekräftelse. /new börjar nytt samtal och /stop kopplar bort Telegram.",
                )
                return
            }
        }
        try {
            val question =
                if (message.has("voice")) {
                    val audio = message.path("voice")
                    if (audio.path("duration").asInt(61) > 60) {
                        send(
                            chatId,
                            "Röstmeddelanden får vara högst 60 sekunder. Skicka ett kortare meddelande eller skriv text.",
                        )
                        return
                    }
                    val transcription =
                        voice.transcribe(
                            audio.path("file_id").asText(),
                            audio.path("duration").asInt(),
                            audio.path("file_size").asLong(-1),
                        )
                    send(
                        chatId,
                        "Jag uppfattade: $transcription\nDu kan rätta detta i nästa meddelande före bekräftelse.",
                    )
                    transcription
                } else text.trim()
            if (question.isEmpty()) {
                send(chatId, "Skicka text eller ett svenskt röstmeddelande på högst 60 sekunder.")
                return
            }
            val repliedMessage = message.path("reply_to_message").path("message_id").asLong(-1)
            val activity = callbacks.activityForReply(connection, repliedMessage)
            assistant.send(
                actor,
                assistant.activeTelegram(actor).id,
                MessageCommand(question, activityId = activity),
            ) { reply ->
                // Recheck after generation so a disconnect cannot leak a late private answer.
                identities.actor(connection)
                sendReply(chatId, reply)
            }
        } catch (_: Exception) {
            send(
                chatId,
                "Frågan kunde inte behandlas. Ingen ny ändring har bekräftats. Försök med text eller ett nytt kort röstmeddelande.",
            )
        }
    }

    private fun callback(update: Long, callback: JsonNode) {
        val user = callback.path("from").path("id").asLong()
        val message = callback.path("message")
        val chat = message.path("chat")
        if (chat.path("type").asText() != "private" || user != chat.path("id").asLong()) return
        val connection = identities.connection(user, user) ?: return
        if (!identities.advance(connection, update)) return
        val actor = identities.actor(connection)
        val data = callback.path("data").asText()
        val answer =
            try {
                when {
                    data.matches(Regex("p:[0-9a-f-]{36}")) -> {
                        val result = proposals.confirm(actor, UUID.fromString(data.substring(2)))
                        result.proposal?.let {
                            sendReply(
                                user,
                                AssistantReply(
                                    "Förena",
                                    it.organizationId,
                                    result.message,
                                    listOf(it),
                                ),
                            )
                        }
                        result.message
                    }
                    data.matches(Regex("i:[0-9a-f-]{36}:[ad]")) -> {
                        val id = UUID.fromString(data.substring(2, 38))
                        val answer =
                            callbacks.respond(
                                connection,
                                message.path("message_id").asLong(),
                                id,
                                data.last() == 'a',
                                update,
                            )
                        try {
                            val receipt = callbacks.receipt(connection, id)
                            telegram.call(
                                "editMessageText",
                                mapOf(
                                    "chat_id" to user,
                                    "message_id" to message.path("message_id").asLong(),
                                    "text" to "${receipt.body}\n$answer",
                                    "reply_markup" to
                                        mapOf(
                                            "inline_keyboard" to
                                                listOf(
                                                    listOf(
                                                        TelegramButton(
                                                            if (receipt.response == "accepted")
                                                                "✅ Kommer"
                                                            else "Kommer",
                                                            callback_data = "i:$id:a",
                                                            style =
                                                                if (receipt.response == "accepted")
                                                                    "success"
                                                                else null,
                                                        ),
                                                        TelegramButton(
                                                            if (receipt.response == "declined")
                                                                "❌ Kan inte"
                                                            else "Kan inte",
                                                            callback_data = "i:$id:d",
                                                            style =
                                                                if (receipt.response == "declined")
                                                                    "danger"
                                                                else null,
                                                        ),
                                                    ),
                                                    listOf(
                                                        TelegramButton(
                                                            "Öppna Förena",
                                                            url =
                                                                "${web.origin}/activities/${receipt.activityId}",
                                                        )
                                                    ),
                                                )
                                        ),
                                ),
                            )
                        } catch (_: Exception) {
                            /* The response already committed; transport feedback cannot undo it. */
                        }
                        answer
                    }
                    else -> "Knappen kan inte användas. Ta fram ett nytt förslag."
                }
            } catch (_: Exception) {
                "Underlaget eller behörigheten har ändrats. Öppna Förena eller ta fram ett nytt förslag."
            }
        telegram.call(
            "answerCallbackQuery",
            mapOf("callback_query_id" to callback.path("id").asText(), "text" to answer.take(180)),
        )
    }

    private fun membership(update: Long, event: JsonNode) {
        val chat = event.path("chat")
        val status = event.path("new_chat_member").path("status").asText()
        if (chat.path("type").asText() == "private" && status in listOf("kicked", "left")) {
            identities.connection(chat.path("id").asLong(), chat.path("id").asLong())?.let {
                connection ->
                if (identities.advance(connection, update))
                    identities.disconnect(connection.subject)
            }
        } else if (status in listOf("kicked", "left")) groups.removeChat(chat.path("id").asLong())
    }

    private fun sendReply(chat: Long, reply: AssistantReply) {
        if (reply.pending) return
        send(chat, "${reply.sender}: ${reply.text}")
        reply.proposals.forEach { proposal ->
            val button =
                if (proposal.kind in listOf("response", "attendance"))
                    TelegramButton(
                        if (proposal.kind == "attendance") "Registrera närvaro"
                        else "Bekräfta svar",
                        callback_data = "p:${proposal.id}",
                    )
                else
                    TelegramButton(
                        "Granska i Förena",
                        url = "${web.origin}/assistant?conversation=${proposal.conversationId}",
                    )
            send(chat, proposal.label, listOf(listOf(button)))
        }
    }

    private fun send(chat: Long, text: String, buttons: List<List<TelegramButton>> = emptyList()) {
        val parts = text.chunked(3800)
        parts.forEachIndexed { index, part ->
            telegram.call(
                "sendMessage",
                mapOf(
                    "chat_id" to chat,
                    "text" to part,
                    "protect_content" to true,
                    "reply_markup" to
                        mapOf(
                            "inline_keyboard" to
                                if (index == parts.lastIndex) buttons else emptyList()
                        ),
                ),
            )
        }
    }

    private fun finish(id: Long, state: String) {
        transactions.executeWithoutResult {
            repository.finishUpdate(state, id)
        }
    }
}

@RestController
class TelegramWebhookController(
    private val webhook: TelegramWebhookService,
    private val json: JsonMapper,
) {
    @PostMapping("/api/telegram/webhook")
    fun handle(request: HttpServletRequest): ResponseEntity<Map<String, Boolean>> {
        require(request.contentLengthLong <= 128000)
        val bytes = request.inputStream.readNBytes(128001)
        require(bytes.size <= 128000)
        webhook.handle(json.readTree(bytes))
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(mapOf("ok" to true))
    }
}
