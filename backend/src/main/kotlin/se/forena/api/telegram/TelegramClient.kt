package se.forena.api.telegram

import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper

@com.fasterxml.jackson.annotation.JsonInclude(
    com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL
)
data class TelegramButton(
    val text: String,
    val callback_data: String? = null,
    val url: String? = null,
    val style: String? = null,
)

interface TelegramClient {
    fun call(method: String, arguments: Map<String, Any?>): JsonNode

    fun audio(fileId: String): ByteArray
}

/** No URL/body logging: Telegram's API URL contains the credential. Never follow redirects. */
@Component
class TelegramHttpClient(
    private val json: JsonMapper,
    @Value("\${FORENA_TELEGRAM_BOT_TOKEN:}") private val token: String,
) : TelegramClient {
    private val http =
        HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build()

    override fun call(method: String, arguments: Map<String, Any?>): JsonNode {
        require(
            method in
                setOf(
                    "sendMessage",
                    "editMessageText",
                    "answerCallbackQuery",
                    "getChatMember",
                    "getMe",
                    "createChatInviteLink",
                    "getFile",
                )
        )
        check(token.matches(Regex("[0-9]+:[A-Za-z0-9_-]+")))
        try {
            val request =
                HttpRequest.newBuilder(URI("https://api.telegram.org/bot$token/$method"))
                    .timeout(Duration.ofSeconds(10))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(arguments)))
                    .build()
            val response = http.send(request, HttpResponse.BodyHandlers.ofInputStream())
            response.body().use { stream ->
                val bytes = stream.readNBytes(262145)
                check(bytes.size <= 262144)
                val body = json.readTree(bytes)
                if (response.statusCode() != 200 || !body.path("ok").asBoolean()) {
                    val status =
                        body.path("error_code").asInt(response.statusCode()).takeIf {
                            it in 400..599
                        } ?: 503
                    val error =
                        org.springframework.web.server.ResponseStatusException(
                            org.springframework.http.HttpStatusCode.valueOf(status)
                        )
                    val retry =
                        body.path("parameters").path("retry_after").asLong(30).coerceIn(1, 86400)
                    if (status == 429) error.headers.add("Retry-After", retry.toString())
                    throw error
                }
                return body.path("result")
            }
        } catch (error: org.springframework.web.server.ResponseStatusException) {
            throw error
        } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
            throw IllegalStateException("Telegram unavailable")
        } catch (_: Exception) {
            throw IllegalStateException("Telegram unavailable")
        }
    }

    override fun audio(fileId: String): ByteArray {
        require(fileId.length in 1..200)
        val path = call("getFile", mapOf("file_id" to fileId)).path("file_path").asText()
        require(path.matches(Regex("[a-zA-Z0-9_/-]+\\.[a-zA-Z0-9]+")) && !path.contains(".."))
        try {
            val request =
                HttpRequest.newBuilder(URI("https://api.telegram.org/file/bot$token/$path"))
                    .timeout(Duration.ofSeconds(15))
                    .GET()
                    .build()
            val response = http.send(request, HttpResponse.BodyHandlers.ofInputStream())
            return response.body().use { stream ->
                check(response.statusCode() == 200)
                val bytes = stream.readNBytes(5_000_001)
                require(bytes.size <= 5_000_000)
                bytes
            }
        } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
            throw IllegalStateException("Audio unavailable")
        } catch (_: Exception) {
            throw IllegalStateException("Audio unavailable")
        }
    }
}
