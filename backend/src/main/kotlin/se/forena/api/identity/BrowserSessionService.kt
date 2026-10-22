package se.forena.api.identity

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty

import org.springframework.security.authentication.AuthenticationServiceException
import org.springframework.security.authentication.BadCredentialsException
import jakarta.servlet.http.HttpServletRequest
import java.time.Instant
import java.util.UUID
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.jwt.JwtDecoder
import org.springframework.session.Session
import org.springframework.session.SessionRepository
import org.springframework.session.FindByIndexNameSessionRepository
import org.springframework.session.jdbc.JdbcIndexedSessionRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import se.forena.api.identity.internal.BrowserAuthProvider
import tools.jackson.databind.JsonNode

/** Spring Session owns persistence, cookie and inactivity; this adapter owns provider tokens. */
@Service
@ConditionalOnWebApplication
@ConditionalOnProperty(name = ["forena.auth.mode"], havingValue = "supabase", matchIfMissing = true)
class BrowserSessionService(
    private val jdbc: JdbcTemplate, private val transaction: TransactionTemplate,
    private val settings: BrowserSessionSettings, private val provider: BrowserAuthProvider,
    private val decoder: JwtDecoder, private val active: SessionService,
    repository: JdbcIndexedSessionRepository
) {
    @Suppress("UNCHECKED_CAST")
    private val store = repository as SessionRepository<Session>

    fun login(email: String, password: String, request: HttpServletRequest): BrowserSessionView {
        settings.requireEnabled()
        if (email.length !in 3..320 || password.length !in 1..1024) throw BadCredentialsException("Session verification failed")
        return create(provider.password(email, password), request)
    }
    fun passkeyOptions(): JsonNode { settings.requireEnabled(); return provider.options() }
    fun passkeyVerify(challenge: String, credential: JsonNode, request: HttpServletRequest) =
        create(provider.verify(challenge, credential), request)
    fun magicLinkVerify(code: String, verifier: String, request: HttpServletRequest) =
        create(provider.exchangeCode(code, verifier), request)

    private fun create(tokens: JsonNode, request: HttpServletRequest): BrowserSessionView {
        val access = text(tokens, "access_token")
        val refresh = text(tokens, "refresh_token")
        val jwt = decoder.decode(access)
        active.requireActive(actor(jwt))
        request.getSession(false)?.invalidate()
        val session = request.getSession(true)
        session.setAttribute(TOKENS, encrypt(access, refresh, jwt, session.id))
        session.setAttribute(FindByIndexNameSessionRepository.PRINCIPAL_NAME_INDEX_NAME, jwt.subject)
        return view(jwt)
    }

    fun resolve(request: HttpServletRequest): BrowserSessionToken? {
        settings.requireEnabled()
        val browser = request.getSession(false) ?: return null
        // An anonymous ceremony session holds a passkey challenge or PKCE verifier.
        // A session check in another tab must not destroy a pending sign-in.
        if (browser.getAttribute(TOKENS) == null) return null
        val resolved = try {
            transaction.execute {
                // Reload AFTER locking; another instance may have refreshed since servlet loading.
                // Only the fresh repository object writes token attributes, never the servlet copy.
                val rows = jdbc.queryForList("select primary_id from forena.spring_session where session_id=? for update", browser.id)
                if (rows.isEmpty()) return@execute null
                val session = store.findById(browser.id) ?: return@execute null
                if (!session.creationTime.plusSeconds(settings.maxSeconds).isAfter(Instant.now())) {
                    store.deleteById(session.id); return@execute null
                }
                val encrypted = session.getAttribute<String>(TOKENS) ?: return@execute null
                val state = settings.decrypt(encrypted, session.id).split('\n')
                if (state.size != 5) throw BadCredentialsException("Session verification failed")
                var access = state[0]
                val subject = UUID.fromString(state[3])
                if (state[2].toLong() <= Instant.now().epochSecond + 60) {
                    try {
                        val renewed = provider.refresh(state[1])
                        access = text(renewed, "access_token")
                        val jwt = decoder.decode(access)
                        if (jwt.subject != state[3] || jwt.getClaimAsString("session_id") != state[4]) throw BadCredentialsException("Session verification failed")
                        session.setAttribute(TOKENS, encrypt(access, text(renewed, "refresh_token"), jwt, session.id))
                        store.save(session)
                    } catch (_: BadCredentialsException) { store.deleteById(session.id); return@execute null }
                }
                BrowserSessionToken(access, subject)
            }
        } catch (_: BadCredentialsException) {
            browser.invalidate(); return null
        }
        if (resolved == null) browser.invalidate()
        return resolved
    }

    fun current(token: String): BrowserSessionView {
        val jwt = decoder.decode(token)
        active.requireActive(actor(jwt))
        return view(jwt)
    }

    /** Spring invalidation deletes locally before any provider network call. */
    fun logout(request: HttpServletRequest) {
        val session = request.getSession(false) ?: return
        val token = try {
            session.getAttribute(TOKENS)?.let { settings.decrypt(it as String, session.id).substringBefore('\n') }
        } catch (_: BadCredentialsException) { null }
        session.invalidate()
        if (token != null) {
            try { provider.logout(token) } catch (_: BadCredentialsException) {} catch (_: AuthenticationServiceException) {}
        }
    }

    private fun encrypt(access: String, refresh: String, jwt: Jwt, id: String) = settings.encrypt(
        "$access\n$refresh\n${jwt.expiresAt!!.epochSecond}\n${jwt.subject}\n${jwt.getClaimAsString("session_id")}", id)
    private fun view(jwt: Jwt) = BrowserSessionView(BrowserUser(jwt.subject ?: throw BadCredentialsException("Session verification failed"), jwt.getClaimAsString("email")))
    private fun text(node: JsonNode, name: String): String = node.get(name)?.takeIf { it.isString }?.asString()?.takeIf { it.isNotBlank() && !it.contains('\n') }
        ?: throw AuthenticationServiceException("Session verification failed")
    private fun actor(jwt: Jwt) = Actor(UUID.fromString(jwt.subject), UUID.fromString(jwt.getClaimAsString("session_id")), jwt.tokenValue)

    companion object { const val TOKENS = "forena.provider-tokens" }
}
