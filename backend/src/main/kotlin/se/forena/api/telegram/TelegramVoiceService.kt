package se.forena.api.telegram

import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.util.Base64
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import tools.jackson.databind.json.JsonMapper

interface VoiceTranscriber {
    fun transcribe(fileId: String, duration: Int, size: Long): String
}

@Service
class TelegramVoiceService(
    private val telegram: TelegramClient,
    private val json: JsonMapper,
    @Value("\${FORENA_TELEGRAM_VOICE_ENABLED:false}") private val enabled: Boolean,
    @Value("\${FORENA_TRANSCRIPTION_MODEL:}") private val model: String,
    @Value("\${FORENA_TRANSCRIPTION_RETENTION_VERIFIED:false}")
    private val retentionVerified: Boolean,
    @Value("\${AI_GATEWAY_API_KEY:}") private val key: String,
    @Value("\${VERCEL_OIDC_TOKEN:}") private val oidc: String,
) : VoiceTranscriber {
    private val http =
        HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build()

    override fun transcribe(fileId: String, duration: Int, size: Long): String {
        require(duration in 0..60 && (size == -1L || size in 1..5_000_000))
        check(
            enabled &&
                retentionVerified &&
                model.isNotBlank() &&
                (key.isNotBlank() || oidc.isNotBlank())
        )
        val audio = telegram.audio(fileId)
        try {
            // Gateway's versioned native transcription protocol, matched to installed
            // @ai-sdk/gateway.
            val body =
                json.writeValueAsString(
                    mapOf(
                        "audio" to Base64.getEncoder().encodeToString(audio),
                        "mediaType" to "audio/ogg",
                        "providerOptions" to mapOf("openai" to mapOf("language" to "sv")),
                    )
                )
            val request =
                HttpRequest.newBuilder(
                        URI("https://ai-gateway.vercel.sh/v4/ai/transcription-model")
                    )
                    .timeout(Duration.ofSeconds(30))
                    .header("Authorization", "Bearer ${key.ifBlank { oidc }}")
                    .header("Content-Type", "application/json")
                    .header("ai-model-id", model)
                    .header("ai-transcription-model-specification-version", "4")
                    .header("ai-gateway-protocol-version", "0.0.1")
                    .header("ai-gateway-auth-method", if (key.isBlank()) "oidc" else "api-key")
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build()
            val response = http.send(request, HttpResponse.BodyHandlers.ofInputStream())
            return response.body().use { stream ->
                check(response.statusCode() == 200)
                val bytes = stream.readNBytes(32001)
                require(bytes.size <= 32000)
                val result = json.readTree(bytes)
                require(result.path("durationInSeconds").asDouble(duration.toDouble()) <= 60)
                result.path("text").asText().trim().also { require(it.length in 1..4000) }
            }
        } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
            throw IllegalStateException("Transcription unavailable")
        } catch (_: Exception) {
            throw IllegalStateException("Transcription unavailable")
        } finally {
            audio.fill(0)
        }
    }
}
