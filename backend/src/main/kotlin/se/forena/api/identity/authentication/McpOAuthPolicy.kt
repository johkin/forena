package se.forena.api.identity.authentication

import java.time.Duration

/** Shared by dynamic registration and explicitly provisioned MCP clients. */
internal object McpOAuthPolicy {
    val ACCESS_TOKEN_TTL: Duration = Duration.ofMinutes(15)
    val REFRESH_TOKEN_TTL: Duration = Duration.ofHours(24)
}
