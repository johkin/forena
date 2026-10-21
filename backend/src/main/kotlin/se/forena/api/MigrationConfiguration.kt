package se.forena.api

import liquibase.integration.spring.SpringLiquibase
import org.springframework.beans.factory.InitializingBean
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.DependsOn
import org.springframework.core.env.Environment
import org.springframework.jdbc.datasource.DriverManagerDataSource

@Configuration(proxyBeanMethods = false)
class MigrationConfiguration {
    // Always present for AOT; shouldRun is resolved at process start, not image build.
    @Bean
    fun liquibase(environment: Environment): SpringLiquibase = SpringLiquibase().apply {
        val enabled = environment.getProperty("spring.liquibase.enabled", Boolean::class.java, true)
        setShouldRun(enabled)
        changeLog = "classpath:db/changelog.xml"
        defaultSchema = "forena"
        liquibaseSchema = "forena"
        if (enabled) {
            val password = environment.getRequiredProperty("spring.liquibase.password")
            require(password.isNotBlank()) { "Migration owner password is required" }
            dataSource = DriverManagerDataSource(
                environment.getRequiredProperty("spring.datasource.url"),
                environment.getRequiredProperty("spring.liquibase.user"), password)
        }
    }

    @Bean
    @DependsOn("liquibase")
    fun verifyDatabaseAtStartup(environment: Environment, verifier: DatabaseAccessVerifier): InitializingBean =
        InitializingBean {
            if (environment.getProperty("spring.liquibase.enabled", Boolean::class.java, true)) verifier.verify()
        }
}
