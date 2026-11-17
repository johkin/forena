package se.forena.api.identity.authentication

import jakarta.servlet.http.HttpServletRequest
import java.time.Duration
import java.time.Instant
import java.util.UUID
import org.springframework.security.access.AccessDeniedException
import org.springframework.security.authentication.BadCredentialsException
import org.springframework.security.authentication.AuthenticationManager
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import se.forena.api.identity.*
import se.forena.api.identity.internal.AccountProfileRepository
import se.forena.api.identity.internal.AccountSecurityRepository
import se.forena.api.identity.internal.UserRepository
import se.forena.api.identity.internal.UserEntity

/** Spring authenticates passwords/passkeys; this service owns account security commands. */
@Service
@Transactional
class AccountSecurityService(
    private val repository: AccountSecurityRepository, private val profiles: AccountProfileRepository,
    private val accounts: AccountService, private val users: UserRepository,
    private val authentication: AuthenticationManager, private val passwords: PasswordEncoder,
    private val clock: DatabaseClockService, private val mail: AuthMailService,
    private val settings: BrowserSessionSettings,
) {
    fun reauthenticate(subject: UUID, password: String, request: HttpServletRequest) {
        require(password.toByteArray(Charsets.UTF_8).size <= 72)
        profiles.lock(subject)
        requireSession(subject, request)
        try { authentication.authenticate(UsernamePasswordAuthenticationToken.unauthenticated(subject.toString(), password)) }
        catch (_: BadCredentialsException) { throw AccessDeniedException("Reauthentication failed") }
        markRecent(subject, request)
    }
    fun requireRecent(subject: UUID, request: HttpServletRequest) {
        val user = requireSession(subject, request)
        val state = request.getSession(false)?.getAttribute(RECENT) as? String
        val at = state?.substringAfterLast('\n')?.toLongOrNull()
        if (at == null || state.substringBeforeLast('\n') != "$subject\n${user.authVersion}" ||
            Instant.ofEpochMilli(at).plus(Duration.ofMinutes(5)) <= clock.now())
            throw AccessDeniedException("Reauthentication required")
    }
    fun passkeyChange(subject: UUID, request: HttpServletRequest, action: () -> Unit) {
        profiles.lock(subject)
        requireRecent(subject, request)
        action()
    }
    fun markRecent(subject: UUID, request: HttpServletRequest) {
        val user = accounts.requireUser(subject)
        request.getSession(true).setAttribute(RECENT, "$subject\n${user.authVersion}\n${clock.now().toEpochMilli()}")
    }
    fun sessions(subject: UUID, request: HttpServletRequest): List<AccountSessionView> {
        requireSession(subject, request)
        val session = requireNotNull(request.getSession(false))
        repository.device(session.id, device(request.getHeader("User-Agent")))
        return repository.sessions(subject, session.id, settings.maxSeconds)
    }
    fun revoke(subject: UUID, request: HttpServletRequest, id: String?) {
        profiles.lock(subject)
        requireSession(subject, request)
        id?.let { UUID.fromString(it) }
        repository.revoke(subject, requireNotNull(request.getSession(false)).id, id)
        if (id == request.getSession(false)?.id) request.getSession(false)?.invalidate()
    }
    fun password(subject: UUID, password: String, request: HttpServletRequest) {
        profiles.lock(subject)
        requireRecent(subject, request)
        require(password.length >= 12 && password.toByteArray(Charsets.UTF_8).size <= 72)
        repository.password(subject, requireNotNull(passwords.encode(password)))
        continueCurrent(subject, request)
        repository.cancelEmail(subject)
    }
    fun requestEmail(subject: UUID, rawEmail: String, request: HttpServletRequest) {
        profiles.lock(subject)
        requireRecent(subject, request)
        val email = accounts.email(rawEmail)
        require(users.findByEmail(email) == null)
        val code = UUID.randomUUID().toString()
        val expires = clock.now().plus(Duration.ofMinutes(30))
        val user = accounts.requireUser(subject)
        repository.emailRequest(subject, email, settings.fingerprint(code), requireNotNull(request.getSession(false)).id, user.authVersion, expires)
        mail.enqueue(email, "email-change", "${settings.origin}/account/email/confirm?code=$code", expires)
    }
    fun cancelEmail(subject: UUID, request: HttpServletRequest) {
        profiles.lock(subject)
        requireSession(subject, request)
        repository.cancelEmail(subject)
    }
    fun confirmEmail(subject: UUID, code: String, request: HttpServletRequest) {
        require(code.length in 1..256)
        profiles.lock(subject)
        val pending = repository.pendingEmail(subject, settings.fingerprint(code)) ?: throw AccessDeniedException("Invalid link")
        val user = requireSession(subject, request)
        if (pending.expiresAt <= clock.now() || pending.authVersion != user.authVersion ||
            pending.sessionId != request.getSession(false)?.id) throw AccessDeniedException("Invalid link")
        require(users.findByEmail(pending.email) == null)
        repository.changeEmail(subject, pending.email)
        repository.cancelEmail(subject)
        continueCurrent(subject, request)
        mail.enqueue(user.email, "email-changed", "${settings.origin}/account/security", clock.now().plus(Duration.ofDays(7)))
    }
    fun rename(subject: UUID, id: String, label: String, request: HttpServletRequest) {
        profiles.lock(subject)
        requireRecent(subject, request)
        require(label.trim().length in 1..120)
        if (repository.renamePasskey(subject, id, label.trim()) != 1) throw AccessDeniedException("Credential owner required")
    }
    private fun requireSession(subject: UUID, request: HttpServletRequest): UserEntity {
        val user = accounts.requireUser(subject)
        val session = request.getSession(false) ?: throw BadCredentialsException("Inactive session")
        if (session.getAttribute(AccountSecurityContextRepository.IDENTITY) != "$subject\n${user.authVersion}" ||
            !repository.activeSession(subject, session.id, settings.maxSeconds)) throw BadCredentialsException("Inactive session")
        return user
    }
    private fun continueCurrent(subject: UUID, request: HttpServletRequest) {
        val user = accounts.requireUser(subject)
        val session = requireNotNull(request.getSession(false))
        repository.revoke(subject, session.id, null)
        session.setAttribute(AccountSecurityContextRepository.IDENTITY, "$subject\n${user.authVersion}")
        session.removeAttribute(RECENT)
    }
    companion object {
        const val RECENT = "forena.recent-authentication"
        fun device(agent: String?): String {
            if (agent.isNullOrBlank()) return "Okänd webbläsare/enhet"
            val browser = when {
                "Edg/" in agent -> "Edge"; "Firefox/" in agent -> "Firefox"; "Chrome/" in agent -> "Chrome"
                "Safari/" in agent -> "Safari"; else -> return "Okänd webbläsare/enhet"
            }
            val os = when {
                "Android" in agent -> "Android"; "iPhone" in agent || "iPad" in agent -> "iOS"
                "Windows" in agent -> "Windows"; "Macintosh" in agent -> "macOS"; "Linux" in agent -> "Linux"; else -> "okänd enhet"
            }
            return "$browser · $os (uppskattat)"
        }
    }
}
