package se.forena.api.assistant

import com.openai.client.okhttp.OpenAIOkHttpClient
import com.openai.core.LogLevel
import com.openai.core.RequestOptions
import com.openai.core.http.HttpClient
import com.openai.core.http.HttpRequest
import com.openai.core.http.HttpResponse
import io.micrometer.observation.ObservationRegistry
import java.io.ByteArrayInputStream
import java.io.InputStream
import java.time.Duration
import java.util.concurrent.CompletableFuture
import org.springframework.ai.chat.client.ChatClient
import org.springframework.ai.chat.client.ChatClientRequest
import org.springframework.ai.chat.client.ChatClientResponse
import org.springframework.ai.chat.client.advisor.ToolCallingAdvisor
import org.springframework.ai.chat.client.advisor.api.CallAdvisor
import org.springframework.ai.chat.client.advisor.api.CallAdvisorChain
import org.springframework.ai.chat.messages.AssistantMessage
import org.springframework.ai.chat.messages.SystemMessage
import org.springframework.ai.chat.messages.ToolResponseMessage
import org.springframework.ai.chat.messages.UserMessage
import org.springframework.ai.chat.model.ChatModel
import org.springframework.ai.chat.model.ToolContext
import org.springframework.ai.chat.prompt.Prompt
import org.springframework.ai.model.tool.ToolCallingChatOptions
import org.springframework.ai.model.tool.ToolCallingManager
import org.springframework.ai.openai.OpenAiChatModel
import org.springframework.ai.openai.OpenAiChatOptions
import org.springframework.ai.tool.ToolCallback
import org.springframework.ai.tool.definition.ToolDefinition
import org.springframework.ai.tool.execution.DefaultToolExecutionExceptionProcessor
import org.springframework.ai.tool.metadata.ToolMetadata
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.web.server.ResponseStatusException
import tools.jackson.databind.json.JsonMapper

interface AssistantModel {
    fun route(context: String): RoutingPlan

    fun answer(instructions: String, context: String): ModelAnswer

    fun answer(instructions: String, context: String, tools: AssistantToolSet): ModelAnswer =
        answer(instructions, context)
}

/** Provider adapter only. Model output is untrusted; the application never exposes write tools. */
@Component
class GatewayAssistantModel(
    private val json: JsonMapper,
    private val prompts: AssistantPrompts,
    @Value("\${FORENA_ASSISTANT_ENABLED:false}") private val enabled: Boolean,
    @Value("\${AI_GATEWAY_MODEL:}") private val model: String,
    @Value("\${AI_GATEWAY_API_KEY:}") private val key: String,
    @Value("\${VERCEL_OIDC_TOKEN:}") private val oidc: String,
) : AssistantModel {
    private val calls by lazy {
        AssistantChatCalls(gatewayChatModel("https://ai-gateway.vercel.sh/v1", model, key.ifBlank { oidc }), json)
    }

    override fun route(context: String): RoutingPlan =
        call(prompts.routing, context, RoutingPlan::class.java)

    override fun answer(instructions: String, context: String): ModelAnswer =
        call(instructions, context, ModelAnswer::class.java)

    override fun answer(instructions: String, context: String, tools: AssistantToolSet): ModelAnswer =
        call(instructions, context, ModelAnswer::class.java, tools)

    private fun <T : Any> call(
        instructions: String,
        context: String,
        type: Class<T>,
        tools: AssistantToolSet? = null,
    ): T {
        if (!enabled || model.isBlank() || (key.isBlank() && oidc.isBlank()))
            throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE)
        try {
            return calls.call(instructions, context, type, tools)
        } catch (failure: Exception) {
            if (failure is InterruptedException) Thread.currentThread().interrupt()
            throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE)
        }
    }
}

/** Keeps the existing redirect and response-byte boundaries while Spring owns the model protocol. */
internal fun gatewayChatModel(baseUrl: String, model: String, token: String): OpenAiChatModel {
    val client = OpenAIOkHttpClient.builder()
        .baseUrl(baseUrl)
        .apiKey(token)
        .timeout(Duration.ofSeconds(35))
        .maxRetries(0)
        .logLevel(LogLevel.OFF)
        .followRedirects(false)
        .build()
        .withOptions { options -> options.httpClient(BoundedGatewayHttpClient(options.build().httpClient)) }
    return OpenAiChatModel.builder()
        .openAiClient(client)
        .openAiClientAsync(client.async())
        .options(OpenAiChatOptions.builder().model(model).build())
        .build()
}

private class BoundedGatewayHttpClient(private val delegate: HttpClient) : HttpClient {
    override fun execute(request: HttpRequest, options: RequestOptions): HttpResponse =
        bounded(delegate.execute(request, options))

    override fun executeAsync(request: HttpRequest, options: RequestOptions): CompletableFuture<HttpResponse> =
        delegate.executeAsync(request, options).thenApply(::bounded)

    private fun bounded(response: HttpResponse): HttpResponse = response.use {
        val bytes = response.body().readNBytes(262145)
        require(bytes.size <= 262144)
        val status = response.statusCode()
        val headers = response.headers()
        object : HttpResponse {
            private val source = ByteArrayInputStream(bytes)

            override fun statusCode(): Int = status

            override fun headers() = headers

            override fun body(): InputStream = source

            override fun close() = source.close()
        }
    }

    override fun close() = delegate.close()
}

/** Spring owns tool dispatch and the call loop; this adapter bounds a single Förena turn. */
internal class AssistantChatCalls(model: ChatModel, private val json: JsonMapper) {
    private val manager = ToolCallingManager.builder()
        .maxTotalToolCalls(8)
        .maxCallsPerTool(3)
        .resolutionFallbackEnabled(false)
        .toolExecutionExceptionProcessor(DefaultToolExecutionExceptionProcessor.builder().alwaysThrow(true).build())
        .build()
    private val client = ChatClient.builder(
        model, ObservationRegistry.NOOP, null, null,
        ToolCallingAdvisor.builder().toolCallingManager(manager),
    ).build()

    fun <T : Any> call(
        instructions: String,
        context: String,
        type: Class<T>,
        tools: AssistantToolSet? = null,
    ): T {
        try {
            require(context.length <= MAX_CONTEXT_CHARACTERS)
            val options = OpenAiChatOptions.builder()
                .maxTokens(4096)
                .responseFormat(OpenAiChatModel.ResponseFormat.builder()
                    .type(OpenAiChatModel.ResponseFormat.Type.JSON_OBJECT).build())
                .toolCallbacks(tools?.callbacks.orEmpty().map(::BoundedToolCallback))
                .toolContext(tools?.context?.context.orEmpty())
                .build()
            val prompt = Prompt(listOf(SystemMessage(instructions), UserMessage(context)), options)
            val content = client.prompt(prompt)
                .advisors(PromptBoundsAdvisor())
                .call()
                .content()
            require(content != null && content.length in 1..30000)
            val answer = json.readValue(content, type)
            if (answer is ModelAnswer) require(answer.answer.isNotBlank())
            return answer
        } catch (failure: Exception) {
            if (failure is InterruptedException) Thread.currentThread().interrupt()
            // Provider output, tool arguments and exceptions may contain private data.
            throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE)
        }
    }

    private class PromptBoundsAdvisor : CallAdvisor {
        private val deadline = System.nanoTime() + Duration.ofSeconds(90).toNanos()
        private var modelCalls = 0

        override fun getName(): String = "Förena turn limits"

        override fun getOrder(): Int = ToolCallingAdvisor.DEFAULT_ORDER + 1

        override fun adviseCall(request: ChatClientRequest, chain: CallAdvisorChain): ChatClientResponse {
            check(System.nanoTime() < deadline)
            check(++modelCalls <= 9)
            val prompt = request.prompt()
            val messageSize = prompt.instructions.sumOf { message ->
                (message.text?.length ?: 0) + when (message) {
                    is AssistantMessage -> message.toolCalls.sumOf { it.arguments().length }
                    is ToolResponseMessage -> message.responses.sumOf { it.responseData().length }
                    else -> 0
                }
            }
            val options = prompt.options as? ToolCallingChatOptions
            val schemaSize = options?.toolCallbacks.orEmpty().sumOf {
                val definition = it.toolDefinition
                definition.name().length + definition.description().length + definition.inputSchema().length
            }
            require(messageSize + schemaSize <= MAX_CONTEXT_CHARACTERS)
            return chain.nextCall(request)
        }
    }

    private class BoundedToolCallback(private val delegate: ToolCallback) : ToolCallback {
        override fun getToolDefinition(): ToolDefinition = delegate.toolDefinition

        override fun getToolMetadata(): ToolMetadata = delegate.toolMetadata

        override fun call(arguments: String): String = call(arguments, ToolContext(emptyMap()))

        override fun call(arguments: String, context: ToolContext?): String {
            require(arguments.length <= 8000)
            val result = delegate.call(arguments, context)
            require(result.length <= 80000)
            return result
        }
    }

    private companion object {
        const val MAX_CONTEXT_CHARACTERS = 180000
    }
}
