package se.forena.api.extensions

import io.swagger.v3.oas.annotations.Parameter
import jakarta.servlet.http.HttpServletRequest
import java.util.UUID
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.*
import se.forena.api.activities.DisciplineTarget
import se.forena.api.extensionapi.*
import se.forena.api.identity.CurrentActorService

@RestController
@RequestMapping("/api")
class DisciplineController(
    private val catalog: DisciplineCatalog,
    private val fields: DisciplineFieldsService,
    private val actors: CurrentActorService,
) {
    @GetMapping("/teams/{team}/discipline-players")
    fun roster(
        @Parameter(hidden = true) authentication: Authentication,
        @Parameter(hidden = true) request: HttpServletRequest,
        @PathVariable team: UUID,
    ) = response(fields.roster(actors.from(authentication, request), team))

    @GetMapping("/disciplines")
    fun catalogue(): ResponseEntity<List<DisciplineDefinition>> = response(catalog.definitions())

    @GetMapping("/discipline-fields")
    fun read(
        @Parameter(hidden = true) authentication: Authentication,
        @Parameter(hidden = true) request: HttpServletRequest,
        @RequestParam teamId: UUID,
        @RequestParam scope: DisciplineScope,
        @RequestParam(required = false) activityId: UUID?,
        @RequestParam(required = false) personId: UUID?,
    ): ResponseEntity<DisciplineFieldsSnapshot> =
        response(
            fields.read(
                actors.from(authentication, request),
                DisciplineTarget(teamId, scope, activityId, personId),
            )
        )

    @PutMapping("/discipline-fields")
    fun save(
        @Parameter(hidden = true) authentication: Authentication,
        @Parameter(hidden = true) request: HttpServletRequest,
        @RequestBody command: DisciplineFieldsCommand,
    ): ResponseEntity<DisciplineFieldsSnapshot> =
        response(fields.save(actors.from(authentication, request), command))

    private fun <T : Any> response(body: T) =
        ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body)
}
