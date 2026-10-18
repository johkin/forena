package se.forena.probe.transport

import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RestController
import se.forena.probe.delivery.ProbeWorker
import se.forena.probe.delivery.WorkerResult

@RestController
class WorkerController(private val worker: ProbeWorker) {
    @PostMapping("/api/probes/worker")
    fun run(): WorkerResult = worker.run()
}
