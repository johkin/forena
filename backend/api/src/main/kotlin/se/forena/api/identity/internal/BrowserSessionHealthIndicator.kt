package se.forena.api.identity.internal

import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication
import org.springframework.boot.health.contributor.Health
import org.springframework.boot.health.contributor.HealthIndicator
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component
import se.forena.api.identity.BrowserSessionSettings

@Component
@ConditionalOnWebApplication
class BrowserSessionHealthIndicator(private val settings: BrowserSessionSettings, private val jdbc: JdbcTemplate) : HealthIndicator {
    override fun health(): Health {
        if (!settings.enabled) return Health.up().build()
        return try {
            // Prove migration 006 and runtime privileges without reading anyone's session.
            jdbc.queryForList("select id_hash,tokens,access_expires_at,expires_at,idle_expires_at from forena.browser_session where false")
            jdbc.queryForList("select key_hash,available_at from forena.auth_rate_limit where false")
            Health.up().build()
        } catch (_: Exception) { Health.down().build() }
    }
}
