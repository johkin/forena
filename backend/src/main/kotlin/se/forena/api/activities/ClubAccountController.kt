package se.forena.api.activities

import jakarta.servlet.http.HttpServletRequest
import java.util.UUID
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.*
import se.forena.api.identity.*

@RestController
@RequestMapping("/api/teams/{team}/account-administration")
class ClubAccountController(private val actors: CurrentActorService, private val accounts: ClubAccountService, private val limiter: BrowserLoginLimiter) {
    @GetMapping fun view(authentication: Authentication, request: HttpServletRequest, @PathVariable team: UUID, @RequestParam(defaultValue = "0") offset: Int): ClubAccountView =
        accounts.view(actors.from(authentication, request), team, offset)
    @GetMapping("/people/{person}/history") fun history(authentication: Authentication, request: HttpServletRequest, @PathVariable team: UUID, @PathVariable person: UUID, @RequestParam(defaultValue = "0") offset: Int): List<ProfileHistory> =
        accounts.history(actors.from(authentication, request), team, person, offset)
    @PutMapping("/people/{person}/birth-date") fun correct(authentication: Authentication, request: HttpServletRequest, @PathVariable team: UUID, @PathVariable person: UUID, @RequestBody body: BirthDateCorrectionCommand): BrowserAuthAcknowledgement {
        limiter.admitProfile(limiter.client(request), UUID.fromString(authentication.name))
        accounts.correct(actors.from(authentication, request), team, person, body); return BrowserAuthAcknowledgement(true)
    }
    @PutMapping("/proposals/{proposal}") fun review(authentication: Authentication, request: HttpServletRequest, @PathVariable team: UUID, @PathVariable proposal: UUID, @RequestBody body: ReviewGuardianCommand): BrowserAuthAcknowledgement {
        limiter.admitProfile(limiter.client(request), UUID.fromString(authentication.name))
        accounts.review(actors.from(authentication, request), team, proposal, body.approve); return BrowserAuthAcknowledgement(true)
    }
}
