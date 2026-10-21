package se.forena.api

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication

@SpringBootApplication
class ForenaApplication

fun main(args: Array<String>) {
    val jdbcUrl = databaseUrlWithCertificate(System.getenv("FORENA_JDBC_URL"), System.getenv("FORENA_DB_CA_CERTIFICATE"))
    val runtimeArgs = if (jdbcUrl != null) args + "--spring.datasource.url=$jdbcUrl" else args
    val migrate = System.getenv("FORENA_MIGRATE_ONLY") == "true"
    val verifyAccess = System.getenv("FORENA_VERIFY_DATABASE_ACCESS") == "true"
    require(!migrate || !verifyAccess) { "Choose migration or verification-only mode" }
    val oneShot = migrate || verifyAccess
    val applicationArgs = when {
        verifyAccess -> runtimeArgs + arrayOf("--spring.main.web-application-type=none", "--spring.liquibase.enabled=false")
        migrate -> runtimeArgs + arrayOf("--spring.main.web-application-type=none", "--spring.liquibase.enabled=true")
        else -> runtimeArgs
    }
    val context = runApplication<ForenaApplication>(*applicationArgs)
    if (oneShot) {
        try { if (verifyAccess) context.getBean(DatabaseAccessVerifier::class.java).verify() }
        finally { context.close() }
    }
}
