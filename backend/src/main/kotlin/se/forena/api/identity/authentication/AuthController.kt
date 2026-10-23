package se.forena.api.identity.authentication

import jakarta.servlet.http.HttpServletRequest
import java.util.UUID
import org.springframework.security.core.Authentication
import org.springframework.security.web.webauthn.management.JdbcPublicKeyCredentialUserEntityRepository
import org.springframework.security.web.webauthn.management.JdbcUserCredentialRepository
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import se.forena.api.identity.BrowserAuthAcknowledgement
import se.forena.api.identity.BrowserLoginLimiter
import se.forena.api.identity.BrowserSessionView
import se.forena.api.identity.BrowserUser
import se.forena.api.identity.MagicLinkRequest

@RestController
class AuthController(private val accounts: AccountService,
    private val limiter: BrowserLoginLimiter,
    private val credentialUsers: JdbcPublicKeyCredentialUserEntityRepository, private val credentials: JdbcUserCredentialRepository) {
    private fun admit(request: HttpServletRequest, email: String? = null) = limiter.admit(limiter.client(request), email)
    private fun ok() = BrowserAuthAcknowledgement(true)
    @PostMapping("/api/auth/register")
    fun register(@RequestBody body: RegisterRequest, request: HttpServletRequest): BrowserAuthAcknowledgement {
        admit(request, body.email); accounts.register(body.email, body.password, request); return ok()
    }
    @GetMapping("/api/auth/session")
    fun session(authentication: Authentication): BrowserSessionView {
        val user = accounts.requireUser(UUID.fromString(authentication.name))
        return BrowserSessionView(BrowserUser(user.subject.toString(), user.email))
    }
    @PostMapping("/api/auth/email/verify")
    fun verifyEmail(@RequestBody body: CodeRequest, request: HttpServletRequest): BrowserAuthAcknowledgement {
        admit(request); accounts.verifyEmail(body.code, request); return ok()
    }
    @PostMapping("/api/auth/password/reset-request")
    fun resetRequest(@RequestBody body: MagicLinkRequest, request: HttpServletRequest): BrowserAuthAcknowledgement {
        admit(request, body.email); accounts.requestLink(body.email, "reset"); return ok()
    }
    @PostMapping("/api/auth/password/reset")
    fun reset(@RequestBody body: ResetRequest, request: HttpServletRequest): BrowserAuthAcknowledgement {
        admit(request); accounts.resetPassword(body.code, body.password); return ok()
    }
    @GetMapping("/api/auth/passkeys")
    fun listPasskeys(authentication: Authentication): List<PasskeyView> {
        accounts.requireUser(UUID.fromString(authentication.name))
        val user = credentialUsers.findByUsername(authentication.name) ?: return emptyList()
        return credentials.findByUserId(user.id).map { PasskeyView(it.credentialId.toBase64UrlString(), it.label) }
    }
}
