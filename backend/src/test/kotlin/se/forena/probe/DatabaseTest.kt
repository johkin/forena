package se.forena.probe

import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.testcontainers.postgresql.PostgreSQLContainer

abstract class DatabaseTest {
    companion object {
        val database = PostgreSQLContainer("postgres:17.6-alpine").withInitScript("init.sql").also { it.start() }
        const val TOKEN = "local-only-token-with-at-least-32-characters"
        @JvmStatic
        @DynamicPropertySource
        fun properties(registry: DynamicPropertyRegistry) {
            registry.add("spring.datasource.url") { database.jdbcUrl }
            registry.add("spring.datasource.username") { "forena_probe_runtime" }
            registry.add("spring.datasource.password") { "local-probe-only" }
            registry.add("spring.liquibase.enabled") { true }
            registry.add("spring.liquibase.user") { database.username }
            registry.add("spring.liquibase.password") { database.password }
            registry.add("probe.token") { TOKEN }
        }
    }
}
