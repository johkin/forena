package se.forena.api.capabilities.playerevaluation

import jakarta.servlet.http.HttpServletRequest
import io.swagger.v3.oas.annotations.Operation
import java.util.UUID
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.*
import se.forena.api.identity.CurrentActorService

@RestController
@RequestMapping("/api/teams/{teamId}/player-evaluation")
class EvaluationController(private val service: EvaluationService, private val actors: CurrentActorService) {
    @GetMapping
    @Operation(operationId = "getPlayerEvaluation")
    fun read(authentication: Authentication, request: HttpServletRequest, @PathVariable teamId: UUID,
             @RequestParam(required = false) activityId: UUID?) = response(service.snapshot(actors.from(authentication, request), teamId, activityId))

    @PutMapping
    @Operation(operationId = "configurePlayerEvaluation")
    fun configure(authentication: Authentication, request: HttpServletRequest, @PathVariable teamId: UUID,
                  @RequestBody command: EvaluationConfiguration) = response(service.configure(actors.from(authentication, request), teamId, command))

    @PutMapping("/scores")
    @Operation(operationId = "savePlayerScores")
    fun score(authentication: Authentication, request: HttpServletRequest, @PathVariable teamId: UUID,
              @RequestParam(required = false) activityId: UUID?, @RequestBody command: EvaluationScoreCommand) =
        response(service.score(actors.from(authentication, request), teamId, activityId, command))

    private fun <T : Any> response(body: T) = ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body)
}
