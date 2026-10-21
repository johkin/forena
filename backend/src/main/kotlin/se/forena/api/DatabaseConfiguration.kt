package se.forena.api

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.data.jdbc.core.dialect.JdbcDialect
import org.springframework.data.jdbc.core.dialect.JdbcPostgresDialect

@Configuration(proxyBeanMethods = false)
class DatabaseConfiguration {
    // AOT needs the dialect before runtime datasource properties are bound.
    @Bean
    fun jdbcDialect(): JdbcDialect = JdbcPostgresDialect.INSTANCE
}
