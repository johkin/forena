package se.forena.api.extensions

import io.swagger.v3.oas.annotations.Parameter
import jakarta.servlet.http.HttpServletRequest
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.*
import se.forena.api.identity.CurrentActorService

@RestController
@RequestMapping("/api")
class InformationController(
    private val information: InformationService,
    private val correction: InformationCorrectionService,
    private val capabilities: CapabilityRuntime,
    private val actors: CurrentActorService,
) {
    @GetMapping("/activities/{id}/follow-up")
    fun read(
        @Parameter(hidden = true) auth: Authentication,
        @Parameter(hidden = true) request: HttpServletRequest,
        @PathVariable id: UUID,
    ) = response(information.snapshot(actors.from(auth, request), id))

    @PutMapping("/activities/{id}/follow-up")
    fun save(
        @Parameter(hidden = true) auth: Authentication,
        @Parameter(hidden = true) request: HttpServletRequest,
        @PathVariable id: UUID,
        @RequestBody command: InformationCommand,
    ) = response(correction.save(actors.from(auth, request), id, command))

    @GetMapping("/teams/{team}/capabilities")
    fun settings(
        @Parameter(hidden = true) auth: Authentication,
        @Parameter(hidden = true) request: HttpServletRequest,
        @PathVariable team: UUID,
    ) = response(information.settings(actors.from(auth, request), team))

    @PutMapping("/teams/{team}/capabilities")
    fun configure(
        @Parameter(hidden = true) auth: Authentication,
        @Parameter(hidden = true) request: HttpServletRequest,
        @PathVariable team: UUID,
        @RequestBody command: CapabilityChange,
    ): ResponseEntity<Map<String, Boolean>> {
        information.configure(actors.from(auth, request), team, command)
        return response(mapOf("ok" to true))
    }

    @GetMapping("/teams/{team}/follow-up-report")
    fun report(
        @Parameter(hidden = true) auth: Authentication,
        @Parameter(hidden = true) request: HttpServletRequest,
        @PathVariable team: UUID,
        @RequestParam from: Instant,
        @RequestParam until: Instant,
    ) = response(information.report(actors.from(auth, request), team, from, until))

    @GetMapping("/teams/{team}/information-report")
    fun periodReport(
        @Parameter(hidden = true) auth: Authentication,
        @Parameter(hidden = true) request: HttpServletRequest,
        @PathVariable team: UUID,
        @RequestParam(required = false) fromDate: LocalDate?,
        @RequestParam(required = false) untilDate: LocalDate?,
        @RequestParam(required = false) season: Int?,
    ) =
        response(
            information.periodReport(actors.from(auth, request), team, fromDate, untilDate, season)
        )

    @GetMapping("/teams/{team}/follow-up")
    fun pending(
        @Parameter(hidden = true) auth: Authentication,
        @Parameter(hidden = true) request: HttpServletRequest,
        @PathVariable team: UUID,
    ) = response(information.pending(actors.from(auth, request), team))

    @GetMapping("/teams/{team}/signals")
    fun signals(
        @Parameter(hidden = true) auth: Authentication,
        @Parameter(hidden = true) request: HttpServletRequest,
        @PathVariable team: UUID,
    ) = response(capabilities.list(actors.from(auth, request), team))

    @PostMapping("/signals/{id}/actions")
    fun action(
        @Parameter(hidden = true) auth: Authentication,
        @Parameter(hidden = true) request: HttpServletRequest,
        @PathVariable id: UUID,
        @RequestBody command: SignalCommand,
    ): ResponseEntity<Map<String, Boolean>> {
        capabilities.action(actors.from(auth, request), id, command)
        return response(mapOf("ok" to true))
    }

    private fun <T : Any> response(value: T) =
        ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(value)
}
