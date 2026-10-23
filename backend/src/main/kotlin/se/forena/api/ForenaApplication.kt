package se.forena.api

import org.springframework.boot.autoconfigure.EnableAutoConfiguration
import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.builder.SpringApplicationBuilder
import org.springframework.context.annotation.Import
import org.springframework.core.env.MapPropertySource

@SpringBootApplication
class ForenaApplication

/** The migration JAR needs only database infrastructure, never web or mail credentials. */
@EnableAutoConfiguration
@Import(DatabaseConfiguration::class, MigrationConfiguration::class, DatabaseAccessVerifier::class)
class MigrationApplication

fun main(args: Array<String>) {
    val migrate = System.getenv("FORENA_MIGRATE_ONLY") == "true"
    val verifyAccess = System.getenv("FORENA_VERIFY_DATABASE_ACCESS") == "true"
    require(!migrate || !verifyAccess) { "Choose migration or verification-only mode" }
    val oneShot = migrate || verifyAccess
    val applicationArgs = when {
        verifyAccess -> args + arrayOf("--spring.main.web-application-type=none", "--spring.liquibase.enabled=false")
        migrate -> args + arrayOf("--spring.main.web-application-type=none", "--spring.liquibase.enabled=true")
        else -> args
    }
    val context = SpringApplicationBuilder(if (oneShot) MigrationApplication::class.java else ForenaApplication::class.java).initializers({ context ->
            // Resolve the selected profile first: an inherited remote URL/CA must not
            // override the local profile's datasource through command-line arguments.
            val environment = context.environment
            val certificate = environment.getProperty("FORENA_DB_CA_CERTIFICATE")
            if (!environment.matchesProfiles("local") && !certificate.isNullOrBlank()) {
                databaseUrlWithCertificate(environment.getProperty("spring.datasource.url"), certificate)?.let { url ->
                    environment.propertySources.addFirst(MapPropertySource("databaseCertificate", mapOf("spring.datasource.url" to url)))
                }
            }
    }).run(*applicationArgs)
    if (oneShot) {
        try { if (verifyAccess) context.getBean(DatabaseAccessVerifier::class.java).verify() }
        finally { context.close() }
    }
}
