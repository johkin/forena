package se.forena.api.mcp

import io.modelcontextprotocol.common.McpTransportContext
import io.modelcontextprotocol.json.jackson3.JacksonMcpJsonMapper
import io.modelcontextprotocol.server.McpStatelessServerFeatures.SyncToolSpecification
import io.modelcontextprotocol.server.transport.DefaultServerTransportSecurityValidator
import io.modelcontextprotocol.spec.McpSchema
import java.util.UUID
import org.springframework.ai.mcp.McpToolUtils
import org.springframework.ai.mcp.server.webmvc.transport.WebMvcStatelessServerTransport
import org.springframework.ai.tool.method.MethodToolCallbackProvider
import org.springframework.aot.hint.annotation.RegisterReflectionForBinding
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.security.authentication.BadCredentialsException
import org.springframework.security.oauth2.server.resource.authentication.BearerTokenAuthentication
import se.forena.api.identity.Actor
import se.forena.api.identity.BrowserSessionSettings
import tools.jackson.databind.json.JsonMapper

@Configuration(proxyBeanMethods = false)
@RegisterReflectionForBinding(McpActivities::class)
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
            McpTransportContext.create(mapOf(McpActivityService.ACTOR_CONTEXT_KEY to actor))
        }
        .build()

    @Bean
    fun activityTools(service: McpActivityService): List<SyncToolSpecification> {
        val callbacks = MethodToolCallbackProvider.builder().toolObjects(service).build().toolCallbacks
        return callbacks.map { callback ->
            val specification = McpToolUtils.toStatelessSyncToolSpecification(callback, null)
            val tool = McpSchema.Tool.builder(specification.tool().name(), specification.tool().inputSchema())
                .description(specification.tool().description())
                .annotations(McpSchema.ToolAnnotations.builder().readOnlyHint(true).destructiveHint(false).build())
                .build()
            // Spring AI derives the schema and invokes @Tool. This adapter retains the
            // pilot's strict arguments, read-only hints and neutral error responses.
            SyncToolSpecification(tool) { context, request ->
                if (!request.arguments().isNullOrEmpty()) {
                    toolError("Verktyget tar inga argument.")
                } else {
                    val result = specification.callHandler().apply(context, request)
                    if (result.isError() == true) toolError("Aktiviteterna kunde inte hämtas.") else result
                }
            }
        }
    }

    private fun toolError(message: String): McpSchema.CallToolResult = McpSchema.CallToolResult.builder()
        .addTextContent(message)
        .isError(true)
        .build()
}
