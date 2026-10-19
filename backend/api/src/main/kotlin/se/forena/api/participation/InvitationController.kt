package se.forena.api.participation

import java.util.UUID
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.bind.annotation.PathVariable
import se.forena.api.identity.Actor
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.responses.ApiResponse
import se.forena.api.http.ApiError

@RestController
class InvitationController(private val invitations: Invitations) {
    @GetMapping("/api/activities/{activityId}/my-invitations", produces = ["application/json"])
    @Operation(operationId = "getMyInvitations", description = "Only own people and active guardian links. Future invitations return an empty list. Cache-Control: no-store.")
    @ApiResponse(responseCode = "200", description = "Family invitations", useReturnTypeSchema = true)
    @ApiResponse(responseCode = "400", description = "Invalid activity UUID", content = [Content(schema = Schema(implementation = ApiError::class))])
    @ApiResponse(responseCode = "401", description = "Missing, invalid or locally inactive web session", content = [Content(schema = Schema(implementation = ApiError::class))])
    @ApiResponse(responseCode = "404", description = "Activity unavailable to family", content = [Content(schema = Schema(implementation = ApiError::class))])
    fun list(@Parameter(hidden = true) @AuthenticationPrincipal jwt: Jwt, @PathVariable activityId: UUID): ResponseEntity<FamilyInvitations> =
        ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(invitations.list(actor(jwt), activityId))

    @PutMapping("/api/invitations/{invitationId}/respond", consumes = ["application/json"], produces = ["application/json"])
    @Operation(operationId = "respondToInvitation", description = "Identical state creates no revision. Concurrent commands serialize in database lock order; a delayed different answer can replace an earlier one. Cache-Control: no-store.")
    @ApiResponse(responseCode = "200", description = "Committed or unchanged state", useReturnTypeSchema = true)
    @ApiResponse(responseCode = "400", description = "Invalid body or invitation UUID", content = [Content(schema = Schema(implementation = ApiError::class))])
    @ApiResponse(responseCode = "401", description = "Missing, invalid or locally inactive web session", content = [Content(schema = Schema(implementation = ApiError::class))])
    @ApiResponse(responseCode = "403", description = "Invitation unavailable to family", content = [Content(schema = Schema(implementation = ApiError::class))])
    @ApiResponse(responseCode = "409", description = "Activity cancelled, ended or invitation not sent", content = [Content(schema = Schema(implementation = ApiError::class))])
    fun respond(@Parameter(hidden = true) @AuthenticationPrincipal jwt: Jwt, @PathVariable invitationId: UUID,
                @RequestBody body: RespondToInvitationRequest): ResponseEntity<InvitationResponseResult> {
        val text = body.comment?.trim()
            ?.codePoints()?.limit(500)?.toArray()?.let { String(it, 0, it.size) }?.ifEmpty { null }
        invitations.respond(actor(jwt), invitationId, ResponseChange(body.response.value, body.commentProvided, text))
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(InvitationResponseResult())
    }

    private fun actor(jwt: Jwt) = Actor(UUID.fromString(jwt.subject), UUID.fromString(jwt.getClaimAsString("session_id")))
}
