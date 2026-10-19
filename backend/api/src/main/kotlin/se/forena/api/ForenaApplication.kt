package se.forena.api

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication

@SpringBootApplication
class ForenaApplication

fun main(args: Array<String>) {
    val migrate = System.getenv("FORENA_MIGRATE") == "true"
    val context = runApplication<ForenaApplication>(*(if (migrate) args + "--spring.main.web-application-type=none" else args))
    if (migrate) context.close()
}
