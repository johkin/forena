package se.forena.api.activities

import jakarta.servlet.http.HttpServletRequest
import java.util.UUID
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.*
import se.forena.api.identity.*

@RestController
@RequestMapping("/api/teams/{team}/account-administration")
class ClubAccountController(private val actors: CurrentActorService, private val accounts: ClubAccountService) {
    @GetMapping fun view(authentication: Authentication, request: HttpServletRequest, @PathVariable team: UUID): ClubAccountView =
        accounts.view(actors.from(authentication, request), team)
    @GetMapping("/people/{person}/history") fun history(authentication: Authentication, request: HttpServletRequest, @PathVariable team: UUID, @PathVariable person: UUID): List<ProfileHistory> =
        accounts.history(actors.from(authentication, request), team, person)
    @PutMapping("/people/{person}/birth-date") fun correct(authentication: Authentication, request: HttpServletRequest, @PathVariable team: UUID, @PathVariable person: UUID, @RequestBody body: BirthDateCorrectionCommand): BrowserAuthAcknowledgement {
        accounts.correct(actors.from(authentication, request), team, person, body); return BrowserAuthAcknowledgement(true)
    }
    @PutMapping("/proposals/{proposal}") fun review(authentication: Authentication, request: HttpServletRequest, @PathVariable team: UUID, @PathVariable proposal: UUID, @RequestBody body: ReviewGuardianCommand): BrowserAuthAcknowledgement {
        accounts.review(actors.from(authentication, request), team, proposal, body.approve); return BrowserAuthAcknowledgement(true)
    }
}
