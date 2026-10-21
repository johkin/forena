package se.forena.api

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication

@SpringBootApplication
class ForenaApplication

fun main(args: Array<String>) {
    val jdbcUrl = databaseUrlWithCertificate(System.getenv("FORENA_JDBC_URL"), System.getenv("FORENA_DB_CA_CERTIFICATE"))
    val runtimeArgs = if (jdbcUrl != null) args + "--spring.datasource.url=$jdbcUrl" else args
    val migrate = System.getenv("FORENA_MIGRATE") == "true"
    val context = runApplication<ForenaApplication>(*(if (migrate) runtimeArgs + "--spring.main.web-application-type=none" else runtimeArgs))
    if (migrate) context.close()
}
