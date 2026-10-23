package se.forena.api.identity

import org.springframework.security.authentication.AuthenticationServiceException
import org.springframework.http.HttpStatus
import org.springframework.web.ErrorResponseException
import jakarta.servlet.http.HttpServletRequest
import java.net.InetAddress
import java.sql.Timestamp
import java.time.Duration
import java.time.Instant
import java.util.Locale
import java.util.UUID
import org.springframework.beans.factory.annotation.Value
import org.springframework.dao.DataAccessException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component
import org.springframework.transaction.support.TransactionTemplate


/** Shared, continuously refilled buckets. Failed provider attempts consume permits too. */
@Component
class BrowserLoginLimiter(
    private val jdbc: JdbcTemplate, private val transaction: TransactionTemplate,
    private val settings: BrowserSessionSettings,
    @Value("\${forena.web-session.trust-vercel-proxy:false}") private val trustVercelProxy: Boolean
) {
    /** Only enable header trust behind Vercel's ingress, which overwrites X-Forwarded-For. */
    fun client(request: HttpServletRequest): String {
        if (trustVercelProxy) {
            val values = request.getHeaders("X-Forwarded-For").toList()
            val value = values.singleOrNull()?.trim()
            val ipv4 = value != null && value.matches(Regex("(?:[0-9]{1,3}\\.){3}[0-9]{1,3}")) && value.split('.').all { it.toInt() in 0..255 }
            val literal = value != null && (value.contains(':') || ipv4)
            if (literal && value != null && value.length <= 45 && value.matches(Regex("[0-9a-fA-F:.]+"))) {
                val address = runCatching { InetAddress.getByName(value) }.getOrNull()
                if (address != null) return address.hostAddress
            }
        }
        return request.remoteAddr
    }

    /** Commits the admission before any network call; no refresh/session transaction takes this lock. */
    fun admit(client: String, email: String? = null) = admitBuckets(
        "login-global", "client:$client", email?.let { "email:${it.trim().lowercase(Locale.ROOT)}" })

    /** Separate budgets prevent bootstrap traffic from consuming login permits. */
    fun admitBootstrap(client: String, subject: UUID) = admitBuckets(
        "admin-bootstrap-global", "admin-bootstrap-client:$client", "admin-bootstrap-account:$subject")

    private fun admitBuckets(globalScope: String, clientScope: String, identityScope: String?) {
        settings.requireEnabled()
        try {
            val delay = transaction.execute {
                val global = settings.fingerprint(globalScope)
                jdbc.update("insert into forena.auth_rate_limit(key_hash,available_at) values(?,clock_timestamp()) on conflict do nothing", global)
                val globalTime = jdbc.queryForObject("select available_at from forena.auth_rate_limit where key_hash=? for update", Timestamp::class.java, global)!!.toInstant()
                val now = jdbc.queryForObject("select clock_timestamp()", Timestamp::class.java)!!.toInstant()
                val buckets = mutableListOf(Bucket(global, 15, 10, globalTime))
                fun add(scope: String, interval: Long, burst: Long) {
                    val hash = settings.fingerprint(scope)
                    val time = jdbc.query("select available_at from forena.auth_rate_limit where key_hash=?", { rs, _ -> rs.getTimestamp(1).toInstant() }, hash).singleOrNull() ?: now
                    buckets.add(Bucket(hash, interval, burst, time))
                }
                // Check before creating client/email rows: rejected traffic cannot grow the table.
                if (buckets[0].retryAfter(now) > 0) return@execute buckets[0].retryAfter(now)
                add(clientScope, 30, 5)
                if (identityScope != null) add(identityScope, 60, 3)
                val retry = buckets.maxOf { it.retryAfter(now) }
                if (retry > 0) return@execute retry
                for (bucket in buckets) jdbc.update("""insert into forena.auth_rate_limit(key_hash,available_at) values(?,?)
                    on conflict(key_hash) do update set available_at=excluded.available_at""",
                    bucket.hash, Timestamp.from(bucket.next(now)))
                0L
            } ?: throw AuthenticationServiceException("Session verification failed")
            if (delay > 0) throw ErrorResponseException(HttpStatus.TOO_MANY_REQUESTS).also { it.headers.set("Retry-After", delay.toString()) }
        } catch (_: DataAccessException) { throw AuthenticationServiceException("Session verification failed") }
    }

    /** Deleting fully refilled buckets is equivalent to retaining their full capacity. */
    @org.springframework.scheduling.annotation.Scheduled(fixedDelay = 60000)
    fun purge() { if (!settings.enabled) return; jdbc.update("delete from forena.auth_rate_limit where available_at < clock_timestamp()-interval '10 minutes'") }

    private class Bucket(val hash: String, val interval: Long, val burst: Long, val available: Instant) {
        fun next(now: Instant) = maxOf(now, available).plusSeconds(interval)
        fun retryAfter(now: Instant): Long {
            val excess = Duration.between(now.plusSeconds(interval * burst), next(now)).toMillis()
            return if (excess <= 0) 0 else (excess + 999) / 1000
        }
    }
}
