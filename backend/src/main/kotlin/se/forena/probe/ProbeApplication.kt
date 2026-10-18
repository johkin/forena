package se.forena.probe

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication
import org.springframework.scheduling.annotation.EnableAsync

@SpringBootApplication
@EnableAsync
class ProbeApplication

fun main(args: Array<String>) {
    val migrationOnly = System.getenv("PROBE_MIGRATE") == "true"
    val actualArgs = if (migrationOnly) args + "--spring.main.web-application-type=none" else args
    val context = runApplication<ProbeApplication>(*actualArgs)
    if (migrationOnly) context.close()
}
