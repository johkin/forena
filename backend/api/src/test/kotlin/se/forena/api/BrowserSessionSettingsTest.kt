package se.forena.api

import java.util.Base64
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import se.forena.api.identity.BrowserSessionSettings
import se.forena.api.identity.InactiveSession

class BrowserSessionSettingsTest {
    private val key = Base64.getEncoder().encodeToString(ByteArray(32) { 9 })
    private fun settings(origin: String = "https://app.example.invalid", secure: Boolean = true, encryption: String = key) =
        BrowserSessionSettings(true, origin, encryption, 28800, 1800, secure)

    @Test fun `encrypted tokens are randomized and authenticated against their session row`() {
        val settings = settings()
        val secret = "private-access\nprivate-refresh"
        val encrypted = settings.encrypt(secret, "session-a")
        assertThat(encrypted).doesNotContain("private")
        assertThat(settings.encrypt(secret, "session-a")).isNotEqualTo(encrypted)
        assertThat(settings.decrypt(encrypted, "session-a")).isEqualTo(secret)
        assertThatThrownBy { settings.decrypt(encrypted, "session-b") }.isInstanceOf(InactiveSession::class.java)
        assertThatThrownBy { settings.decrypt("invalid", "session-a") }.isInstanceOf(InactiveSession::class.java)
        val changedKey = Base64.getEncoder().encodeToString(ByteArray(32) { 8 })
        assertThatThrownBy { settings(encryption=changedKey).decrypt(encrypted, "session-a") }.isInstanceOf(InactiveSession::class.java)
    }

    @Test fun `runtime rejects weak keys noncanonical origins and insecure remote cookies`() {
        for (origin in listOf("http://app.example.invalid", "https://app.example.invalid/", "https://user@app.example.invalid", "https://app.example.invalid?evil=1", ""))
            assertThatThrownBy { settings(origin) }.isInstanceOf(IllegalArgumentException::class.java)
        assertThatThrownBy { settings(secure=false) }.isInstanceOf(IllegalArgumentException::class.java)
        assertThatThrownBy { settings(encryption=Base64.getEncoder().encodeToString(ByteArray(16))) }.isInstanceOf(IllegalArgumentException::class.java)
        assertThat(settings("http://127.0.0.1:3000", false).cookieName).isEqualTo("forena-local-session")
        assertThat(settings().cookieName).isEqualTo("__Host-forena-session")
    }
}
