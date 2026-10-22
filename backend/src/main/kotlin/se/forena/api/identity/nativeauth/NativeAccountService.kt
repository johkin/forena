package se.forena.api.identity.nativeauth

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.security.authentication.BadCredentialsException
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.authentication.ott.GenerateOneTimeTokenRequest
import org.springframework.security.authentication.ott.JdbcOneTimeTokenService
import org.springframework.security.authentication.ott.OneTimeTokenAuthenticationToken
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.core.userdetails.User
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import se.forena.api.identity.BrowserSessionSettings
import se.forena.api.identity.BrowserSessionView
import se.forena.api.identity.BrowserUser
import se.forena.api.identity.internal.AccountRepository
import se.forena.api.identity.internal.NativeUserEntity
import se.forena.api.identity.internal.NativeUserRepository
import java.net.URLEncoder
import java.nio.charset.StandardCharsets.UTF_8
import java.time.Duration
import java.util.Locale
import java.util.UUID

@Service
@ConditionalOnProperty(name = ["forena.auth.mode"], havingValue = "native")
class NativeAccountService(private val users: NativeUserRepository, private val accounts: AccountRepository,
    private val passwords: PasswordEncoder, private val tokens: JdbcOneTimeTokenService,
    private val mail: NativeAuthMailService, private val settings: BrowserSessionSettings,
    private val contexts: NativeSessionRepository) {
    private val dummyPassword = passwords.encode("synthetic-nonexistent-account-password")
    fun email(value: String): String = value.trim().lowercase(Locale.ROOT).also {
        require(it.length in 3..320 && it.matches(Regex("[^\\s@]+@[^\\s@]+\\.[^\\s@]+")))
    }
    private fun password(value: String): String {
        require(value.length >= 12 && value.toByteArray(UTF_8).size <= 72) { "Password must have at least 12 characters and at most 72 UTF-8 bytes" }
        return requireNotNull(passwords.encode(value))
    }
    fun requireUser(id: UUID): NativeUserEntity {
        val user = users.findById(id) ?: throw BadCredentialsException("Inactive account")
        if (!user.verified || !accounts.existsBySubjectAndEnabledTrue(id)) throw BadCredentialsException("Inactive account")
        return user
    }
    @Transactional
    fun register(rawEmail: String, rawPassword: String, request: HttpServletRequest) {
        val email = email(rawEmail)
        val hash = password(rawPassword)
        val existing = users.findByEmail(email)
        if (existing != null) {
            if (!existing.verified && users.replacePendingPassword(existing.subject, hash) == 1) {
                val token = issue(users.findById(existing.subject)!!, "verify")
                request.getSession(true).setAttribute(VERIFY, settings.fingerprint(token))
            }
            return
        }
        val id = UUID.randomUUID()
        users.createAccount(id); users.createUser(id, email, hash)
        val token = issue(users.findById(id)!!, "verify")
        request.getSession(true).setAttribute(VERIFY, settings.fingerprint(token))
    }
    fun login(rawEmail: String, rawPassword: String): NativeUserEntity {
        val user = users.findByEmail(email(rawEmail))
        val matches = rawPassword.toByteArray(UTF_8).size <= 72 && passwords.matches(rawPassword, user?.passwordHash ?: dummyPassword)
        if (!matches || user == null) throw BadCredentialsException("Invalid login")
        return requireUser(user.subject)
    }
    fun createSession(user: NativeUserEntity, request: HttpServletRequest, response: HttpServletResponse): BrowserSessionView {
        requireUser(user.subject)
        val oauthReturn = request.getSession(false)?.getAttribute(NativeOAuthConfiguration.RETURN) as? String
        request.getSession(false)?.invalidate()
        val principal = User.withUsername(user.subject.toString()).password("").authorities("USER", "AUTH_VERSION_${user.authVersion}").build()
        val context = SecurityContextHolder.createEmptyContext()
        context.authentication = UsernamePasswordAuthenticationToken.authenticated(principal, null, principal.authorities)
        contexts.saveContext(context, request, response)
        oauthReturn?.let { request.getSession(false)?.setAttribute(NativeOAuthConfiguration.RETURN, it) }
        SecurityContextHolder.setContext(context)
        return BrowserSessionView(BrowserUser(user.subject.toString(), user.email))
    }
    @Transactional
    fun requestLink(rawEmail: String, purpose: String, request: HttpServletRequest? = null) {
        val user = users.findByEmail(email(rawEmail))
        // Create a ceremony session even for unknown accounts; the response does not enumerate users.
        val session = if (purpose == "login") request!!.getSession(true) else null
        if (user == null || !user.verified || !accounts.existsBySubjectAndEnabledTrue(user.subject)) return
        val token = issue(user, purpose)
        if (session != null) session.setAttribute(MAGIC, settings.fingerprint(token))
    }
    private fun issue(user: NativeUserEntity, purpose: String): String {
        val token = tokens.generate(GenerateOneTimeTokenRequest("$purpose:${user.subject}:${user.authVersion}", Duration.ofMinutes(10)))
        val callback = when (purpose) { "login" -> "/auth/callback?code="; "verify" -> "/auth/verify?code="; "reset" -> "/auth/reset?code="; else -> error("Unknown token purpose") }
        mail.enqueue(user.email, purpose, settings.origin + callback + URLEncoder.encode(token.tokenValue, UTF_8), token.expiresAt)
        return token.tokenValue
    }
    fun magicLogin(code: String, request: HttpServletRequest): NativeUserEntity {
        val session = request.getSession(false) ?: throw BadCredentialsException("Invalid link")
        if (session.getAttribute(MAGIC) != settings.fingerprint(code)) throw BadCredentialsException("Invalid link")
        session.removeAttribute(MAGIC)
        return consume(code, "login")
    }
    @Transactional
    fun verifyEmail(code: String, request: HttpServletRequest) {
        if (request.getSession(false)?.getAttribute(VERIFY) != settings.fingerprint(code)) throw BadCredentialsException("Invalid link")
        val user = consume(code, "verify", false)
        if (users.verifyEmail(user.subject, user.authVersion) != 1) throw BadCredentialsException("Invalid link")
        request.getSession(false)?.removeAttribute(VERIFY)
    }
    @Transactional
    fun resetPassword(code: String, rawPassword: String) {
        val hash = password(rawPassword)
        val user = consume(code, "reset")
        if (users.resetPassword(user.subject, hash, user.authVersion) != 1) throw BadCredentialsException("Invalid link")
    }
    private fun consume(code: String, purpose: String, confirmed: Boolean = true): NativeUserEntity {
        if (code.length !in 1..256) throw BadCredentialsException("Invalid link")
        val token = tokens.consume(OneTimeTokenAuthenticationToken.unauthenticated(code)) ?: throw BadCredentialsException("Invalid link")
        if (!token.username.startsWith("$purpose:")) throw BadCredentialsException("Invalid link")
        val id = runCatching { UUID.fromString(token.username.split(':').getOrNull(1)) }.getOrNull() ?: throw BadCredentialsException("Invalid link")
        val user = if (confirmed) requireUser(id) else users.findById(id)?.takeIf { accounts.existsBySubjectAndEnabledTrue(id) } ?: throw BadCredentialsException("Inactive account")
        if (token.username.substringAfterLast(':') != user.authVersion.toString()) throw BadCredentialsException("Invalid link")
        return user
    }
    companion object { const val VERIFY = "forena.native-email-verification"; const val MAGIC = "forena.native-magic-link" }
}
