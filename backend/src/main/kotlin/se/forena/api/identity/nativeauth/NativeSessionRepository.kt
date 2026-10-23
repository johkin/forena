package se.forena.api.identity.nativeauth

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.slf4j.LoggerFactory
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.core.context.SecurityContext
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.core.userdetails.User
import org.springframework.security.web.context.HttpRequestResponseHolder
import org.springframework.security.web.context.SecurityContextRepository
import org.springframework.session.FindByIndexNameSessionRepository
import org.springframework.stereotype.Component
import se.forena.api.identity.BrowserSessionSettings
import se.forena.api.identity.internal.AccountRepository
import se.forena.api.identity.internal.NativeUserRepository
import java.time.Instant
import java.util.UUID

/** Persist identity and generation only. Never deserialize a SecurityContext or a password. */
@Component
@ConditionalOnProperty(name = ["forena.auth.mode"], havingValue = "native")
class NativeSessionRepository(private val users: NativeUserRepository, private val accounts: AccountRepository,
                              private val settings: BrowserSessionSettings, private val revocations: se.forena.api.identity.internal.RevokedSessionRepository) : SecurityContextRepository {
    private val logger = LoggerFactory.getLogger(NativeSessionRepository::class.java)

    override fun loadContext(holder: HttpRequestResponseHolder): SecurityContext {
        val context = SecurityContextHolder.createEmptyContext()
        val session = holder.request.getSession(false) ?: return context
        val state = (session.getAttribute(IDENTITY) as? String)?.split('\n') ?: return context
        val id = state.firstOrNull()?.let { runCatching { UUID.fromString(it) }.getOrNull() }
        val user = id?.let(users::findById)
        if (state.size != 2 || user == null || !user.verified || user.authVersion.toString() != state[1] ||
            !accounts.existsBySubjectAndEnabledTrue(user.subject) || revocations.existsByIdAndSubject(UUID.fromString(session.id), user.subject) ||
            session.creationTime + settings.maxSeconds * 1000 <= Instant.now().toEpochMilli()) {
            logger.warn("native_auth_failed reason=inactive_session")
            session.invalidate(); return context
        }
        val principal = User.withUsername(user.subject.toString()).password("").authorities("USER", "AUTH_VERSION_${user.authVersion}").build()
        context.authentication = UsernamePasswordAuthenticationToken.authenticated(principal, null, principal.authorities)
        return context
    }
    override fun containsContext(request: HttpServletRequest) = request.getSession(false)?.getAttribute(IDENTITY) != null
    override fun saveContext(context: SecurityContext, request: HttpServletRequest, response: HttpServletResponse) {
        val auth = context.authentication ?: run {
            request.getSession(false)?.removeAttribute(IDENTITY)
            request.getSession(false)?.removeAttribute(FindByIndexNameSessionRepository.PRINCIPAL_NAME_INDEX_NAME)
            return
        }
        val user = users.findById(UUID.fromString(auth.name)) ?: throw IllegalStateException("Unknown account")
        if (auth.authorities.none { it.authority == "AUTH_VERSION_${user.authVersion}" }) throw org.springframework.security.authentication.BadCredentialsException("Inactive session")
        val session = request.getSession(true)
        session.setAttribute(IDENTITY, "${user.subject}\n${user.authVersion}")
        session.setAttribute(FindByIndexNameSessionRepository.PRINCIPAL_NAME_INDEX_NAME, user.subject.toString())
    }
    companion object { const val IDENTITY = "forena.native-identity" }
}
