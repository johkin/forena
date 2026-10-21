package se.forena.api.identity

import org.springframework.security.authentication.AuthenticationServiceException
import org.springframework.security.authentication.BadCredentialsException
import java.net.URI
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component

@Component
class BrowserSessionSettings(
    @Value("\${forena.web-session.enabled:false}") val enabled: Boolean,
    @Value("\${forena.web-session.origin:}") val origin: String,
    @Value("\${forena.web-session.key:}") key: String,
    @Value("\${forena.web-session.max-seconds:28800}") val maxSeconds: Long,
    @Value("\${forena.web-session.idle-seconds:1800}") val idleSeconds: Long,
    @Value("\${forena.web-session.secure:true}") val secure: Boolean
) {
    private val secret = if (enabled) SecretKeySpec(Base64.getDecoder().decode(key).also {
        require(it.size == 32) { "Web sessions require a base64-encoded 32-byte encryption key" }
    }, "AES") else null
    val cookieName get() = if (secure) "__Host-forena-session" else "forena-local-session"
    init {
        if (enabled) {
            val uri = URI(origin)
            require(uri.host != null && uri.rawAuthority == uri.authority && uri.userInfo == null &&
                uri.rawPath.isNullOrEmpty() && uri.query == null && uri.fragment == null &&
                (uri.scheme == "https" || (!secure && uri.scheme == "http" && uri.host in listOf("localhost", "127.0.0.1")))) {
                "Web sessions require a canonical HTTPS origin; insecure cookies are only allowed on loopback"
            }
            require(secure || uri.host in listOf("localhost", "127.0.0.1"))
            require(maxSeconds in 60..86400 && idleSeconds in 30..maxSeconds)
        }
    }
    fun requireEnabled() { if (!enabled) throw AuthenticationServiceException("Session verification failed") }
    /** Keep rate-limit identifiers opaque even to a database-only reader. */
    fun fingerprint(value: String): String {
        requireEnabled()
        return encode(Mac.getInstance("HmacSHA256").run {
            init(SecretKeySpec(secret!!.encoded, "HmacSHA256"))
            doFinal(("auth-rate-limit\n" + value).toByteArray())
        })
    }
    fun encrypt(value: String, context: String): String {
        requireEnabled()
        val nonce = ByteArray(12).also { SecureRandom().nextBytes(it) }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, secret, GCMParameterSpec(128, nonce))
        cipher.updateAAD(context.toByteArray())
        return encode(nonce + cipher.doFinal(value.toByteArray()))
    }
    fun decrypt(value: String, context: String): String {
        requireEnabled()
        return try {
            val bytes = Base64.getUrlDecoder().decode(value)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, secret, GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
            cipher.updateAAD(context.toByteArray())
            String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)))
        } catch (_: Exception) { throw BadCredentialsException("Session verification failed") }
    }
    private fun encode(bytes: ByteArray) = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
}
