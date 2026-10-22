package se.forena.api.mcp

import jakarta.servlet.http.HttpServletRequest
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.security.oauth2.server.resource.authentication.BearerTokenAuthentication
import org.springframework.web.bind.annotation.*
import se.forena.api.activities.PersonalOverviewService
import se.forena.api.identity.Actor
import se.forena.api.identity.BrowserSessionSettings
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.util.UUID

/** Minimal read-only Streamable HTTP MCP pilot; legacy tools are not silently proxied. */
@RestController
@ConditionalOnProperty(name = ["forena.auth.mode"], havingValue = "native")
class NativeMcpController(private val overview: PersonalOverviewService, private val settings: BrowserSessionSettings, private val json: JsonMapper) {
    @GetMapping("/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/api/mcp")
    fun metadata() = mapOf("resource" to settings.origin + "/api/mcp", "authorization_servers" to listOf(settings.origin),
        "scopes_supported" to listOf("mcp:read"), "bearer_methods_supported" to listOf("header"))
    @PostMapping("/api/mcp", consumes = ["application/json"], produces = ["application/json"])
    fun call(authentication: BearerTokenAuthentication, @RequestBody body: JsonNode, request: HttpServletRequest): ResponseEntity<Any> {
        val origin = request.getHeader("Origin")
        if (origin != null && origin != settings.origin) return ResponseEntity.status(403).cacheControl(CacheControl.noStore()).body(mapOf("error" to "Origin denied"))
        if (!body.isObject || body.toString().length > 65536 || body.get("jsonrpc")?.asString() != "2.0") return error(body.get("id"), -32600, "Invalid Request")
        val id = body.get("id")
        val method = body.get("method")?.asString()
        if (id == null && method?.startsWith("notifications/") == true) return ResponseEntity.accepted().cacheControl(CacheControl.noStore()).build()
        val result: Any = when (method) {
            "initialize" -> mapOf("protocolVersion" to "2025-11-25", "capabilities" to mapOf("tools" to emptyMap<String, Any>()), "serverInfo" to mapOf("name" to "Förena", "version" to "1.0"))
            "ping" -> emptyMap<String, Any>()
            "tools/list" -> mapOf("tools" to listOf(mapOf("name" to "list_my_activities", "description" to "Läs dina och familjens kommande aktiviteter. Inga kontaktuppgifter eller svarskommentarer.",
                "inputSchema" to mapOf("type" to "object", "properties" to emptyMap<String, Any>(), "additionalProperties" to false),
                "annotations" to mapOf("readOnlyHint" to true, "destructiveHint" to false))))
            "tools/call" -> {
                val params = body.get("params")
                if (params?.get("name")?.asString() != "list_my_activities" || (params.get("arguments")?.properties()?.count() ?: 0) > 0) return error(id, -32602, "Invalid params")
                val principal = authentication.tokenAttributes
                val actor = Actor(UUID.fromString(authentication.name), UUID.fromString(principal["grant_id"].toString()), authentication.token.tokenValue)
                val snapshot = overview.overview(actor).activities
                val activities = snapshot.take(50).map { mapOf("id" to it.id, "title" to it.title, "starts_at" to it.starts_at, "ends_at" to it.ends_at,
                    "organization" to it.organization.name, "team" to it.team.name, "location" to it.location) }
                mapOf("content" to listOf(mapOf("type" to "text", "text" to json.writeValueAsString(mapOf("activities" to activities, "limit" to 50, "truncated" to (snapshot.size > 50))))), "isError" to false)
            }
            else -> return error(id, -32601, "Method not found")
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(mapOf("jsonrpc" to "2.0", "id" to id, "result" to result))
    }
    private fun error(id: JsonNode?, code: Int, message: String): ResponseEntity<Any> = ResponseEntity.ok().cacheControl(CacheControl.noStore())
        .body(mapOf("jsonrpc" to "2.0", "id" to id, "error" to mapOf("code" to code, "message" to message)))
}
