package se.forena.api.mcp

import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController
import se.forena.api.identity.BrowserSessionSettings

@RestController
class McpMetadataController(private val settings: BrowserSessionSettings) {
    @GetMapping("/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/api/mcp")
    fun metadata() = mapOf(
        "resource" to settings.origin + "/api/mcp",
        "authorization_servers" to listOf(settings.origin),
        "scopes_supported" to listOf("mcp:read"),
        "bearer_methods_supported" to listOf("header")
    )
}
