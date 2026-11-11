package se.forena.api.assistant

import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import java.util.concurrent.atomic.AtomicInteger
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.ai.chat.messages.AssistantMessage
import org.springframework.ai.chat.messages.ToolResponseMessage
import org.springframework.ai.chat.model.ChatModel
import org.springframework.ai.chat.model.ChatResponse
import org.springframework.ai.chat.model.Generation
import org.springframework.ai.chat.model.ToolContext
import org.springframework.ai.chat.prompt.Prompt
import org.springframework.ai.model.tool.ToolCallingChatOptions
import org.springframework.ai.openai.OpenAiChatOptions
import org.springframework.ai.tool.ToolCallback
import org.springframework.ai.tool.annotation.Tool
import org.springframework.ai.tool.definition.ToolDefinition
import org.springframework.ai.tool.method.MethodToolCallbackProvider
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException
import tools.jackson.databind.json.JsonMapper
import tools.jackson.module.kotlin.KotlinModule

class AssistantChatCallsTest {
    private val json = JsonMapper.builder().addModule(KotlinModule.Builder().build()).build()
    private val reads = ReadingTools()
    private val tools = AssistantToolSet(
        MethodToolCallbackProvider.builder().toolObjects(reads).build().toolCallbacks.toList(),
        ToolContext(mapOf("actor" to "server-owned-identity")),
    )

    @Test
    fun `OpenAI compatible HTTP carries schemas and tool results without the server identity`() {
        val requests = mutableListOf<String>()
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/v1/chat/completions") { exchange ->
            requests.add(exchange.requestBody.use { it.readAllBytes().toString(Charsets.UTF_8) })
            val message = if (requests.size == 1) {
                mapOf("role" to "assistant", "content" to null, "tool_calls" to listOf(
                    mapOf("id" to "http-call", "type" to "function", "function" to
                        mapOf("name" to "read_team", "arguments" to "{\"teamId\":\"selected-team\"}")),
                ))
            } else {
                mapOf("role" to "assistant", "content" to "{\"answer\":\"Verifierat svar\"}")
            }
            val bytes = json.writeValueAsBytes(mapOf(
                "id" to "synthetic-completion", "object" to "chat.completion", "created" to 0,
                "model" to "synthetic/test", "choices" to listOf(mapOf(
                    "index" to 0, "message" to message,
                    "finish_reason" to if (requests.size == 1) "tool_calls" else "stop",
                )),
            ))
            exchange.responseHeaders.add("Content-Type", "application/json")
            exchange.sendResponseHeaders(200, bytes.size.toLong())
            exchange.responseBody.use { it.write(bytes) }
        }
        server.start()
        try {
            val model = gatewayChatModel(
                "http://127.0.0.1:${server.address.port}/v1", "synthetic/test", "synthetic-gateway-key",
            )

            val result = AssistantChatCalls(model, json).call("rules", "{}", ModelAnswer::class.java, tools)

            assertThat(result.answer).isEqualTo("Verifierat svar")
            assertThat(requests).hasSize(2)
            assertThat(requests.joinToString()).doesNotContain("server-owned-identity", "tool_context")
            val initial = json.readTree(requests.first())
            assertThat(initial.path("response_format").path("type").asString()).isEqualTo("json_object")
            assertThat(initial.path("max_tokens").asInt()).isEqualTo(4096)
            assertThat(initial.path("tools").first().path("function").path("name").asString())
                .isEqualTo("read_team")
            assertThat(initial.path("tools").toString()).doesNotContain("context", "actor")
            assertThat(requests.last()).contains("verified-result", "tool_call_id", "http-call")
            assertThat(reads.actor).isEqualTo("server-owned-identity")
        } finally {
            server.stop(0)
        }
    }

    @Test
    fun `gateway HTTP does not follow redirects`() {
        val redirected = AtomicInteger()
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/v1/chat/completions") { exchange ->
            exchange.requestBody.close()
            exchange.responseHeaders.add("Location", "http://127.0.0.1:${server.address.port}/redirected")
            exchange.sendResponseHeaders(307, -1)
            exchange.close()
        }
        server.createContext("/redirected") { exchange ->
            redirected.incrementAndGet()
            exchange.sendResponseHeaders(500, -1)
            exchange.close()
        }
        server.start()
        try {
            val model = gatewayChatModel(
                "http://127.0.0.1:${server.address.port}/v1", "synthetic/test", "synthetic-gateway-key",
            )

            assertUnavailable { AssistantChatCalls(model, json).call("rules", "{}", ModelAnswer::class.java) }

            assertThat(redirected.get()).isZero()
        } finally {
            server.stop(0)
        }
    }

    @Test
    fun `gateway HTTP rejects oversized bodies before model JSON parsing`() {
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/v1/chat/completions") { exchange ->
            exchange.requestBody.close()
            // Valid completion JSON with oversized metadata and a short, otherwise accepted answer.
            val bytes = json.writeValueAsBytes(mapOf(
                "id" to "synthetic-completion", "object" to "chat.completion", "created" to 0,
                "model" to "synthetic/test", "padding" to "x".repeat(262145),
                "choices" to listOf(mapOf("index" to 0, "finish_reason" to "stop",
                    "message" to mapOf("role" to "assistant", "content" to "{\"answer\":\"Klart\"}"))),
            ))
            exchange.responseHeaders.add("Content-Type", "application/json")
            exchange.sendResponseHeaders(200, bytes.size.toLong())
            exchange.responseBody.use { it.write(bytes) }
        }
        server.start()
        try {
            val model = gatewayChatModel(
                "http://127.0.0.1:${server.address.port}/v1", "synthetic/test", "synthetic-gateway-key",
            )

            assertUnavailable { AssistantChatCalls(model, json).call("rules", "{}", ModelAnswer::class.java) }
        } finally {
            server.stop(0)
        }
    }

    @Test
    fun `Spring dispatches offered annotated tools with server context and feeds results into the answer`() {
        val turns = AtomicInteger()
        val model = StubModel { prompt ->
            when (turns.incrementAndGet()) {
                1 -> {
                    val options = prompt.options as ToolCallingChatOptions
                    val definition = options.toolCallbacks.orEmpty().single().toolDefinition
                    assertThat(definition.name()).isEqualTo("read_team")
                    assertThat(definition.inputSchema()).contains("teamId").doesNotContain("context", "actor")
                    assertThat(prompt.instructions.map { it.text }.toString())
                        .doesNotContain("server-owned-identity")
                    toolCall()
                }
                2 -> {
                    val response = prompt.instructions.filterIsInstance<ToolResponseMessage>().single()
                    assertThat(response.responses.single().id()).isEqualTo("call-1")
                    assertThat(response.responses.single().name()).isEqualTo("read_team")
                    assertThat(response.responses.single().responseData()).contains("verified-result")
                    textResponse("""{"answer":"Två deltagare"}""")
                }
                else -> error("Unexpected model turn")
            }
        }

        val result = AssistantChatCalls(model, json)
            .call("Svara på svenska", "{\"question\":\"Vilka kommer?\"}", ModelAnswer::class.java, tools)

        assertThat(result.answer).isEqualTo("Två deltagare")
        assertThat(reads.calls).isEqualTo(1)
        assertThat(reads.actor).isEqualTo("server-owned-identity")
        assertThat(reads.teamId).isEqualTo("selected-team")
        assertThat(turns.get()).isEqualTo(2)
    }

    @Test
    fun `unknown tools cannot resolve arbitrary application callbacks`() {
        val model = StubModel { toolCall(name = "confirm_proposal") }

        assertUnavailable { AssistantChatCalls(model, json).call("rules", "{}", ModelAnswer::class.java, tools) }

        assertThat(reads.calls).isZero()
    }

    @Test
    fun `repeated tool requests stop at the Spring per-tool limit`() {
        val turns = AtomicInteger()
        val model = StubModel { toolCall(id = "call-${turns.incrementAndGet()}") }

        assertUnavailable { AssistantChatCalls(model, json).call("rules", "{}", ModelAnswer::class.java, tools) }

        assertThat(reads.calls).isEqualTo(3)
        assertThat(turns.get()).isEqualTo(4)
    }

    @Test
    fun `total call budget applies across different tools`() {
        val executions = AtomicInteger()
        val callbacks = (0..2).map { index ->
            object : ToolCallback {
                override fun getToolDefinition(): ToolDefinition = ToolDefinition.builder()
                    .name("read_$index").description("Read authorized data")
                    .inputSchema("{\"type\":\"object\",\"properties\":{}}")
                    .build()

                override fun call(arguments: String): String {
                    executions.incrementAndGet()
                    return "{}"
                }
            }
        }
        val turns = AtomicInteger()
        val model = StubModel {
            val turn = turns.getAndIncrement()
            toolCall(name = "read_${turn % 3}", arguments = "{}", id = "call-$turn")
        }

        assertUnavailable {
            AssistantChatCalls(model, json).call(
                "rules", "{}", ModelAnswer::class.java, AssistantToolSet(callbacks, ToolContext(emptyMap())),
            )
        }

        assertThat(executions.get()).isEqualTo(8)
        assertThat(turns.get()).isEqualTo(9)
    }

    @Test
    fun `a shared model client gets a fresh tool budget for every answer`() {
        val turns = AtomicInteger()
        val model = StubModel {
            val turn = turns.incrementAndGet()
            if (turn % 4 == 0) textResponse("{\"answer\":\"Klart\"}") else toolCall(id = "call-$turn")
        }
        val client = AssistantChatCalls(model, json)

        repeat(2) {
            assertThat(client.call("rules", "{}", ModelAnswer::class.java, tools).answer)
                .isEqualTo("Klart")
        }

        assertThat(reads.calls).isEqualTo(6)
        assertThat(turns.get()).isEqualTo(8)
    }

    @Test
    fun `oversized tool arguments are rejected before the annotated method runs`() {
        val model = StubModel { toolCall(arguments = "{\"teamId\":\"${"x".repeat(8001)}\"}") }

        assertUnavailable { AssistantChatCalls(model, json).call("rules", "{}", ModelAnswer::class.java, tools) }

        assertThat(reads.calls).isZero()
    }

    @Test
    fun `oversized tool results never enter a follow-up model request`() {
        reads.result = "x".repeat(80001)
        val turns = AtomicInteger()
        val model = StubModel {
            turns.incrementAndGet()
            toolCall()
        }

        assertUnavailable { AssistantChatCalls(model, json).call("rules", "{}", ModelAnswer::class.java, tools) }

        assertThat(reads.calls).isEqualTo(1)
        assertThat(turns.get()).isEqualTo(1)
    }

    @Test
    fun `combined tool history is bounded before a further provider request`() {
        reads.result = "x".repeat(70000)
        val turns = AtomicInteger()
        val model = StubModel { toolCall(id = "call-${turns.incrementAndGet()}") }

        assertUnavailable { AssistantChatCalls(model, json).call("rules", "{}", ModelAnswer::class.java, tools) }

        assertThat(reads.calls).isEqualTo(3)
        assertThat(turns.get()).isEqualTo(3)
    }

    @Test
    fun `tool exceptions and invalid model answers produce only neutral unavailable errors`() {
        reads.failure = IllegalStateException("private SQL and token details")
        val turns = AtomicInteger()
        val model = StubModel {
            turns.incrementAndGet()
            toolCall()
        }
        assertUnavailable { AssistantChatCalls(model, json).call("rules", "{}", ModelAnswer::class.java, tools) }
        assertThat(turns.get()).isEqualTo(1)
        assertUnavailable {
            AssistantChatCalls(StubModel { textResponse("private provider response") }, json)
                .call("rules", "{}", ModelAnswer::class.java)
        }
        assertUnavailable {
            AssistantChatCalls(StubModel { textResponse("""{"answer":" "}""") }, json)
                .call("rules", "{}", ModelAnswer::class.java)
        }
    }

    @Test
    fun `routing stays tool-free and parses its existing contract`() {
        val model = StubModel { prompt ->
            assertThat((prompt.options as ToolCallingChatOptions).toolCallbacks).isEmpty()
            textResponse("""{"targets":[],"clarification":"Vilket lag?"}""")
        }

        val result = AssistantChatCalls(model, json).call("routing", "{}", RoutingPlan::class.java)

        assertThat(result.clarification).isEqualTo("Vilket lag?")
        assertThat(reads.calls).isZero()
    }

    private fun assertUnavailable(action: () -> Unit) {
        val failure = assertThrows<ResponseStatusException> { action() }
        assertThat(failure.message).isEqualTo("503 SERVICE_UNAVAILABLE")
        assertThat(failure.statusCode).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE)
        assertThat(failure.cause).isNull()
    }

    class ReadingTools {
        var calls = 0
        var teamId: String? = null
        var actor: Any? = null
        var result = "verified-result"
        var failure: RuntimeException? = null

        @Tool(name = "read_team", description = "Read an authorized team")
        fun read(teamId: String, context: ToolContext): Map<String, String> {
            calls++
            this.teamId = teamId
            actor = context.context["actor"]
            failure?.let { throw it }
            return mapOf("result" to result)
        }
    }

    private class StubModel(private val respond: (Prompt) -> ChatResponse) : ChatModel {
        override fun getOptions(): OpenAiChatOptions = OpenAiChatOptions.builder().build()

        override fun call(prompt: Prompt): ChatResponse = respond(prompt)
    }

    private fun toolCall(
        name: String = "read_team",
        arguments: String = "{\"teamId\":\"selected-team\"}",
        id: String = "call-1",
    ): ChatResponse = ChatResponse(listOf(Generation(AssistantMessage.builder()
        .toolCalls(listOf(AssistantMessage.ToolCall(id, "function", name, arguments)))
        .build())))

    private fun textResponse(content: String): ChatResponse =
        ChatResponse(listOf(Generation(AssistantMessage.builder().content(content).build())))
}
