package se.forena.api.activities

import jakarta.servlet.http.HttpServletRequest
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.responses.ApiResponse
import java.util.UUID
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.*
import se.forena.api.identity.BrowserLoginLimiter
import se.forena.api.identity.CurrentActorService

@RestController
class RosterInvitationController(private val roster: TeamRosterService, private val actors: CurrentActorService,
    private val limiter: BrowserLoginLimiter) {
    @PostMapping("/api/auth/roster-invitation")
    @Operation(operationId = "prepareRosterInvitation")
    @ApiResponse(responseCode = "204", description = "Invitation prepared in browser session")
    fun prepare(@RequestBody body: RosterInvitationCode, request: HttpServletRequest): ResponseEntity<Void> {
        limiter.admitRosterInvitation(limiter.client(request))
        val id = roster.prepareInvitation(body.code)
        request.getSession(true).setAttribute(PENDING, id.toString())
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build()
    }

    @GetMapping("/api/me/roster-invitation")
    @Operation(operationId = "getPendingRosterInvitation")
    @ApiResponse(responseCode = "200", description = "Pending invitation", useReturnTypeSchema = true)
    @ApiResponse(responseCode = "204", description = "No pending invitation")
    fun pending(authentication: Authentication, request: HttpServletRequest): ResponseEntity<RosterPendingInvitation> {
        val id = request.getSession(false)?.getAttribute(PENDING) as? String
            ?: return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build()
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
            .body(roster.pendingInvitation(actors.from(authentication, request), UUID.fromString(id)))
    }

    @PostMapping("/api/me/roster-invitation")
    @Operation(operationId = "acceptRosterInvitation")
    fun accept(authentication: Authentication, request: HttpServletRequest): ResponseEntity<RosterAccepted> {
        val id = request.getSession(false)?.getAttribute(PENDING) as? String ?: throw NoSuchElementException()
        val team = roster.acceptInvitation(actors.from(authentication, request), UUID.fromString(id))
        request.getSession(false)?.removeAttribute(PENDING)
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(RosterAccepted(team))
    }

    @DeleteMapping("/api/me/roster-invitation")
    @Operation(operationId = "dismissRosterInvitation")
    @ApiResponse(responseCode = "204", description = "Pending acceptance dismissed")
    fun dismiss(request: HttpServletRequest): ResponseEntity<Void> {
        request.getSession(false)?.removeAttribute(PENDING)
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build()
    }

    companion object { const val PENDING = "forena.roster-invitation" }
}
