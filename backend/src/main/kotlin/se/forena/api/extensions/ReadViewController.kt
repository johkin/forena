package se.forena.api.extensions

import jakarta.servlet.http.HttpServletRequest
import io.swagger.v3.oas.annotations.Operation
import java.util.UUID
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.*
import se.forena.api.extensionapi.*
import se.forena.api.identity.CurrentActorService

@RestController
class ReadViewController(private val contributors: List<ReadViewContributor>, private val actors: CurrentActorService) {
    @GetMapping("/api/teams/{teamId}/read-views")
    @Operation(operationId = "getExtensionReadViews")
    fun read(authentication: Authentication, request: HttpServletRequest, @PathVariable teamId: UUID,
             @RequestParam(required = false) activityId: UUID?, @RequestParam(required = false) groupCount: Int?,
             @RequestParam(defaultValue = "ability") mode: String,
             @RequestParam(required = false) personIds: List<UUID>?): ResponseEntity<List<ReadContribution>> {
        val actor = actors.from(authentication, request)
        val query = ReadViewQuery(teamId, activityId, groupCount, mode, personIds)
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(
            contributors.flatMap { it.contributions(actor, query) }.sortedBy { it.order })
    }
}
