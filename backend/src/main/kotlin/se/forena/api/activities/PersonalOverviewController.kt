package se.forena.api.activities

import java.util.UUID
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RestController
import se.forena.api.identity.Actor

@RestController
class PersonalOverviewController(private val overview: PersonalOverviewService) {
    @GetMapping("/api/me/overview", produces = ["application/json"])
    @Operation(operationId = "getPersonalOverview", description = "Complete authorized upcoming overview, including dated team memberships and own team access. Person rows exist independently of invitations. Only sent personal invitations are exposed. No 90-day cutoff or first-page counts. More than 20000 activities fails with 503 rather than returning an incomplete overview. No-store.")
    fun list(@Parameter(hidden = true) @AuthenticationPrincipal jwt: Jwt): ResponseEntity<PersonalOverview> =
        ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(overview.overview(actor(jwt)))

    @GetMapping("/api/activities/{activityId}", produces = ["application/json"])
    @Operation(operationId = "getPersonalActivity", description = "Activity details authorized through personal invitations, dated membership or own team access. Reading never grants response rights for another person. Unknown/unauthorized IDs return 404. No-store.")
    fun activity(@Parameter(hidden = true) @AuthenticationPrincipal jwt: Jwt,
                 @PathVariable activityId: UUID): ResponseEntity<PersonalActivity> =
        ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(overview.activity(actor(jwt), activityId))

    private fun actor(jwt: Jwt) = Actor(UUID.fromString(jwt.subject), UUID.fromString(jwt.getClaimAsString("session_id")), jwt.tokenValue)
}
