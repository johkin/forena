package se.forena.api.identity.nativeauth

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.security.core.Authentication
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.session.web.http.HttpSessionIdResolver
import org.springframework.web.bind.annotation.*
import org.springframework.security.web.webauthn.api.Bytes
import org.springframework.security.web.webauthn.management.JdbcPublicKeyCredentialUserEntityRepository
import org.springframework.security.web.webauthn.management.JdbcUserCredentialRepository
import org.springframework.security.authentication.BadCredentialsException
import se.forena.api.identity.*
import java.util.UUID

@RestController
@ConditionalOnProperty(name = ["forena.auth.mode"], havingValue = "native")
class NativeAuthController(private val accounts: NativeAccountService, private val passkeys: NativePasskeyService,
    private val limiter: BrowserLoginLimiter, private val sessionIds: HttpSessionIdResolver,
    private val credentialUsers: JdbcPublicKeyCredentialUserEntityRepository, private val credentials: JdbcUserCredentialRepository) {
    private fun admit(request: HttpServletRequest, email: String? = null) = limiter.admit(limiter.client(request), email)
    private fun ok() = BrowserAuthAcknowledgement(true)
    @PostMapping("/api/auth/register")
    fun register(@RequestBody body: NativeRegisterRequest, request: HttpServletRequest): BrowserAuthAcknowledgement {
        admit(request, body.email); accounts.register(body.email, body.password, request); return ok()
    }
    @PostMapping("/api/auth/login")
    fun login(@RequestBody body: BrowserLoginRequest, request: HttpServletRequest, response: HttpServletResponse): BrowserSessionView {
        admit(request, body.email); return accounts.createSession(accounts.login(body.email, body.password), request, response)
    }
    @GetMapping("/api/auth/session")
    fun session(authentication: Authentication): BrowserSessionView {
        val user = accounts.requireUser(UUID.fromString(authentication.name))
        return BrowserSessionView(BrowserUser(user.subject.toString(), user.email))
    }
    @PostMapping("/api/auth/logout")
    fun logout(request: HttpServletRequest, response: HttpServletResponse): BrowserAuthAcknowledgement {
        request.getSession(false)?.invalidate(); SecurityContextHolder.clearContext(); sessionIds.expireSession(request, response); return ok()
    }
    @PostMapping("/api/auth/magic-link")
    fun magicLink(@RequestBody body: MagicLinkRequest, request: HttpServletRequest): BrowserAuthAcknowledgement {
        admit(request, body.email); accounts.requestLink(body.email, "login", request); return ok()
    }
    @PostMapping("/api/auth/magic-link/verify")
    fun magicVerify(@RequestBody body: MagicLinkVerifyRequest, request: HttpServletRequest, response: HttpServletResponse): BrowserSessionView {
        admit(request); return accounts.createSession(accounts.magicLogin(body.code, request), request, response)
    }
    @PostMapping("/api/auth/email/verify")
    fun verifyEmail(@RequestBody body: NativeCodeRequest, request: HttpServletRequest): BrowserAuthAcknowledgement {
        admit(request); accounts.verifyEmail(body.code, request); return ok()
    }
    @PostMapping("/api/auth/password/reset-request")
    fun resetRequest(@RequestBody body: MagicLinkRequest, request: HttpServletRequest): BrowserAuthAcknowledgement {
        admit(request, body.email); accounts.requestLink(body.email, "reset"); return ok()
    }
    @PostMapping("/api/auth/password/reset")
    fun reset(@RequestBody body: NativeResetRequest, request: HttpServletRequest): BrowserAuthAcknowledgement {
        admit(request); accounts.resetPassword(body.code, body.password); return ok()
    }
    @PostMapping("/api/auth/passkey/options")
    fun options(request: HttpServletRequest): PasskeyOptions { admit(request); return passkeys.options(null, false, request) }
    @PostMapping("/api/auth/passkey/verify")
    fun verifyPasskey(@RequestBody body: PasskeyVerifyRequest, request: HttpServletRequest, response: HttpServletResponse): BrowserSessionView {
        admit(request); return accounts.createSession(accounts.requireUser(passkeys.authenticate(body, request)), request, response)
    }
    @PostMapping("/api/auth/passkey/registration/options")
    fun registrationOptions(authentication: Authentication, request: HttpServletRequest): PasskeyOptions {
        admit(request); return passkeys.options(authentication, true, request)
    }
    @PostMapping("/api/auth/passkey/registration/verify")
    fun registrationVerify(authentication: Authentication, @RequestBody body: PasskeyVerifyRequest, request: HttpServletRequest): BrowserAuthAcknowledgement {
        admit(request); passkeys.register(authentication, body, request); return ok()
    }
    @GetMapping("/api/auth/passkeys")
    fun listPasskeys(authentication: Authentication): List<NativePasskeyView> {
        accounts.requireUser(UUID.fromString(authentication.name))
        val user = credentialUsers.findByUsername(authentication.name) ?: return emptyList()
        return credentials.findByUserId(user.id).map { NativePasskeyView(it.credentialId.toBase64UrlString(), it.label) }
    }
    @DeleteMapping("/api/auth/passkeys/{id}")
    fun deletePasskey(authentication: Authentication, @PathVariable id: String, request: HttpServletRequest): BrowserAuthAcknowledgement {
        admit(request); accounts.requireUser(UUID.fromString(authentication.name))
        val user = credentialUsers.findByUsername(authentication.name) ?: throw BadCredentialsException("Unknown credential")
        val credential = credentials.findByCredentialId(Bytes.fromBase64(id)) ?: throw BadCredentialsException("Unknown credential")
        if (credential.userEntityUserId != user.id) throw BadCredentialsException("Unknown credential")
        credentials.delete(credential.credentialId); return ok()
    }
}
