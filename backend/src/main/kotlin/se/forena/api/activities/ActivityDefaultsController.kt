package se.forena.api.activities

import io.swagger.v3.oas.annotations.Parameter
import jakarta.servlet.http.HttpServletRequest
import java.util.UUID
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.*
import se.forena.api.identity.CurrentActorService

@RestController
@RequestMapping("/api/activity-defaults")
class ActivityDefaultsController(
    private val service: ActivityDefaultsService,
    private val actors: CurrentActorService,
) {
    @GetMapping
    fun load(
        @Parameter(hidden = true) auth: Authentication,
        @Parameter(hidden = true) request: HttpServletRequest,
        @RequestParam scope: String,
        @RequestParam scopeId: UUID,
    ) =
        ResponseEntity.ok()
            .cacheControl(CacheControl.noStore())
            .body(service.load(actors.from(auth, request), scope, scopeId))

    @PutMapping
    fun save(
        @Parameter(hidden = true) auth: Authentication,
        @Parameter(hidden = true) request: HttpServletRequest,
        @RequestBody command: DefaultsCommand,
    ) =
        ResponseEntity.ok()
            .cacheControl(CacheControl.noStore())
            .body(service.save(actors.from(auth, request), command))
}
