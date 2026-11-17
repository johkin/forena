package se.forena.api.identity

import jakarta.servlet.http.HttpServletRequest
import java.util.UUID
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.*
import se.forena.api.identity.authentication.AccountSecurityService

@RestController
@RequestMapping("/api/me/account")
class AccountProfileController(
    private val actors: CurrentActorService, private val profiles: AccountProfileService,
    private val followers: AccountFollowerService, private val security: AccountSecurityService,
    private val limiter: BrowserLoginLimiter,
) {
    @GetMapping fun view(authentication: Authentication, request: HttpServletRequest): AccountProfileView = profiles.view(actors.from(authentication, request))
    @PutMapping fun update(authentication: Authentication, request: HttpServletRequest, @RequestBody body: OwnProfileCommand): BrowserAuthAcknowledgement {
        profiles.update(actors.from(authentication, request), body); return ok()
    }
    @PutMapping("/children/{id}") fun child(authentication: Authentication, request: HttpServletRequest, @PathVariable id: UUID, @RequestBody body: ChildProfileCommand): BrowserAuthAcknowledgement {
        profiles.updateChild(actors.from(authentication, request), id, body); return ok()
    }
    @GetMapping("/children/{id}/history") fun history(authentication: Authentication, request: HttpServletRequest, @PathVariable id: UUID): List<ProfileHistory> = profiles.history(actors.from(authentication, request), id)
    @GetMapping("/children/{id}/proposals") fun proposals(authentication: Authentication, request: HttpServletRequest, @PathVariable id: UUID): List<GuardianProposalView> = profiles.proposals(actors.from(authentication, request), id)
    @PostMapping("/children/{id}/proposals") fun propose(authentication: Authentication, request: HttpServletRequest, @PathVariable id: UUID, @RequestBody body: GuardianProposalCommand): BrowserAuthAcknowledgement {
        profiles.propose(actors.from(authentication, request), id, body); return ok()
    }
    @PostMapping("/child-links") fun link(authentication: Authentication, request: HttpServletRequest, @RequestBody body: ChildLinkCommand): BrowserAuthAcknowledgement {
        profiles.link(actors.from(authentication, request), body); return ok()
    }
    @DeleteMapping("/child-links/{id}") fun unlink(authentication: Authentication, request: HttpServletRequest, @PathVariable id: UUID): BrowserAuthAcknowledgement {
        profiles.unlink(actors.from(authentication, request), id); return ok()
    }
    @PostMapping("/children/{id}/follower") fun follow(authentication: Authentication, request: HttpServletRequest, @PathVariable id: UUID): BrowserAuthAcknowledgement {
        limiter.admit(limiter.client(request)); followers.request(actors.from(authentication, request), id); return ok()
    }
    @PutMapping("/followers/{id}") fun decide(authentication: Authentication, request: HttpServletRequest, @PathVariable id: UUID, @RequestBody body: FollowerDecision): BrowserAuthAcknowledgement {
        followers.decide(actors.from(authentication, request), id, body.state); return ok()
    }
    @GetMapping("/followers/{id}/matches") fun matches(authentication: Authentication, request: HttpServletRequest, @PathVariable id: UUID): List<FollowerMatch> = followers.matches(actors.from(authentication, request), id)
    @PostMapping("/reauthenticate") fun reauthenticate(authentication: Authentication, request: HttpServletRequest, @RequestBody body: ReauthenticateCommand): BrowserAuthAcknowledgement {
        limiter.admit(limiter.client(request)); security.reauthenticate(UUID.fromString(authentication.name), body.password, request); return ok()
    }
    @GetMapping("/sessions") fun sessions(authentication: Authentication, request: HttpServletRequest): List<AccountSessionView> = security.sessions(UUID.fromString(authentication.name), request)
    @DeleteMapping("/sessions") fun revokeOthers(authentication: Authentication, request: HttpServletRequest): BrowserAuthAcknowledgement {
        security.revoke(UUID.fromString(authentication.name), request, null); return ok()
    }
    @DeleteMapping("/sessions/{id}") fun revoke(authentication: Authentication, request: HttpServletRequest, @PathVariable id: String): BrowserAuthAcknowledgement {
        security.revoke(UUID.fromString(authentication.name), request, id); return ok()
    }
    @PutMapping("/password") fun password(authentication: Authentication, request: HttpServletRequest, @RequestBody body: PasswordChangeCommand): BrowserAuthAcknowledgement {
        security.password(UUID.fromString(authentication.name), body.password, request); return ok()
    }
    @PostMapping("/email") fun email(authentication: Authentication, request: HttpServletRequest, @RequestBody body: EmailChangeCommand): BrowserAuthAcknowledgement {
        limiter.admit(limiter.client(request), body.email); security.requestEmail(UUID.fromString(authentication.name), body.email, request); return ok()
    }
    @DeleteMapping("/email") fun cancelEmail(authentication: Authentication, request: HttpServletRequest): BrowserAuthAcknowledgement {
        security.cancelEmail(UUID.fromString(authentication.name), request); return ok()
    }
    @PostMapping("/email/confirm") fun confirmEmail(authentication: Authentication, request: HttpServletRequest, @RequestBody body: EmailConfirmCommand): BrowserAuthAcknowledgement {
        limiter.admit(limiter.client(request)); security.confirmEmail(UUID.fromString(authentication.name), body.code, request); return ok()
    }
    @PutMapping("/passkeys/{id}") fun label(authentication: Authentication, request: HttpServletRequest, @PathVariable id: String, @RequestBody body: PasskeyLabelCommand): BrowserAuthAcknowledgement {
        security.rename(UUID.fromString(authentication.name), id, body.label, request); return ok()
    }
    private fun ok() = BrowserAuthAcknowledgement(true)
}
