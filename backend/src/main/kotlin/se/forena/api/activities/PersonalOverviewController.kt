package se.forena.api.activities

import java.util.UUID
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.security.core.Authentication
import jakarta.servlet.http.HttpServletRequest
import se.forena.api.identity.CurrentActorService
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RestController
import se.forena.api.identity.Actor

@RestController
class PersonalOverviewController(private val overview: PersonalOverviewService, private val actors: CurrentActorService) {
    @GetMapping("/api/me/overview", produces = ["application/json"])
    @Operation(operationId = "getPersonalOverview", description = "Complete authorized upcoming overview, including dated team memberships, own team access and currently managed teams. Person rows exist independently of invitations. Only sent personal invitations are exposed. No 90-day cutoff or first-page counts. More than 20000 activities fails with 503 rather than returning an incomplete overview. No-store.")
    fun list(@Parameter(hidden = true) authentication: Authentication, @Parameter(hidden = true) request: HttpServletRequest): ResponseEntity<PersonalOverview> =
        ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(overview.overview(actors.from(authentication, request)))

    @GetMapping("/api/activities/{activityId}", produces = ["application/json"])
    @Operation(operationId = "getPersonalActivity", description = "Activity details authorized through personal invitations, dated membership, own team access or current activity-management permission. Reading never grants response rights for another person. Unknown/unauthorized IDs return 404. No-store.")
    fun activity(@Parameter(hidden = true) authentication: Authentication, @Parameter(hidden = true) request: HttpServletRequest,
                 @PathVariable activityId: UUID): ResponseEntity<PersonalActivity> =
        ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(overview.activity(actors.from(authentication, request), activityId))

}
