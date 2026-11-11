package se.forena.api.mcp

import io.modelcontextprotocol.common.McpTransportContext
import io.modelcontextprotocol.json.jackson3.JacksonMcpJsonMapper
import io.modelcontextprotocol.json.schema.jackson3.DefaultJsonSchemaValidator
import io.modelcontextprotocol.server.McpStatelessServerFeatures.SyncToolSpecification
import io.modelcontextprotocol.server.transport.DefaultServerTransportSecurityValidator
import io.modelcontextprotocol.spec.McpSchema
import java.util.UUID
import org.springframework.ai.chat.model.ToolContext
import org.springframework.ai.mcp.McpToolUtils
import org.springframework.ai.mcp.server.webmvc.transport.WebMvcStatelessServerTransport
import org.springframework.ai.tool.ToolCallback
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.security.authentication.BadCredentialsException
import org.springframework.security.oauth2.server.resource.authentication.BearerTokenAuthentication
import se.forena.api.assistant.AssistantToolScope
import se.forena.api.assistant.AssistantToolCatalog
import se.forena.api.identity.Actor
import se.forena.api.identity.BrowserSessionSettings
import tools.jackson.databind.json.JsonMapper

@Configuration(proxyBeanMethods = false)
class McpConfiguration {
    @Bean
    fun webMvcStatelessServerTransport(
        @Qualifier("mcpServerJsonMapper") json: JsonMapper,
        settings: BrowserSessionSettings
    ): WebMvcStatelessServerTransport = WebMvcStatelessServerTransport.builder()
        .jsonMapper(JacksonMcpJsonMapper(json))
        .messageEndpoint("/api/mcp")
        .securityValidator(DefaultServerTransportSecurityValidator.builder().allowedOrigin(settings.origin).build())
        .contextExtractor { request ->
            val authentication = request.principal().orElse(null) as? BearerTokenAuthentication
                ?: throw BadCredentialsException("Missing MCP identity")
            val actor = Actor(
                UUID.fromString(authentication.name),
                UUID.fromString(authentication.tokenAttributes["grant_id"].toString()),
                authentication.token.tokenValue
            )
            McpTransportContext.create(mapOf(ACTOR_CONTEXT_KEY to actor))
        }
        .build()

    @Bean
    fun readTools(catalog: AssistantToolCatalog): List<SyncToolSpecification> {
        val validator = DefaultJsonSchemaValidator()
        return catalog.callbacks.map { callback ->
            val specification = McpToolUtils.toStatelessSyncToolSpecification(McpIdentityToolCallback(callback), null)
            val tool = McpSchema.Tool.builder(specification.tool().name(), specification.tool().inputSchema())
                .description(specification.tool().description())
                .annotations(McpSchema.ToolAnnotations.builder().readOnlyHint(true).destructiveHint(false).build())
                .build()
            SyncToolSpecification(tool) { context, request ->
                try {
                    if (!validator.validate(tool.inputSchema(), request.arguments() ?: emptyMap<String, Any>()).valid()) {
                        toolError("Ogiltiga verktygsargument.")
                    } else {
                        val result = specification.callHandler().apply(context, request)
                        if (result.isError() == true) toolError("Uppgifterna kunde inte hämtas.") else result
                    }
                } catch (_: Exception) {
                    toolError("Uppgifterna kunde inte hämtas.")
                }
            }
        }
    }

    private fun toolError(message: String): McpSchema.CallToolResult = McpSchema.CallToolResult.builder()
        .addTextContent(message)
        .isError(true)
        .build()

    /** Translate the verified transport identity without coupling shared tools to MCP. */
    private class McpIdentityToolCallback(private val callback: ToolCallback) : ToolCallback by callback {
        override fun call(toolInput: String): String = call(toolInput, null)

        override fun call(toolInput: String, toolContext: ToolContext?): String {
            val transport = toolContext?.context?.get(McpToolUtils.TOOL_CONTEXT_MCP_EXCHANGE_KEY) as? McpTransportContext
            val actor = transport?.get(ACTOR_CONTEXT_KEY) as? Actor
                ?: throw BadCredentialsException("Missing MCP identity")
            return callback.call(toolInput, AssistantToolScope.context(actor))
        }
    }

    companion object {
        const val ACTOR_CONTEXT_KEY = "forena.mcp.actor"
    }
}
