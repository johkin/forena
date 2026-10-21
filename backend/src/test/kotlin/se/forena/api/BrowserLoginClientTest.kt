package se.forena.api

import java.util.Base64
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.transaction.support.TransactionTemplate
import se.forena.api.identity.BrowserLoginLimiter
import se.forena.api.identity.BrowserSessionSettings

class BrowserLoginClientTest {
    private val settings = BrowserSessionSettings(true, "https://app.example.invalid",
        Base64.getEncoder().encodeToString(ByteArray(32) { 7 }), 28800, 1800, true)
    private fun limiter(trusted: Boolean) = BrowserLoginLimiter(mock(JdbcTemplate::class.java), mock(TransactionTemplate::class.java), settings, trusted)

    @Test fun `forwarded headers never override the peer without an explicit ingress trust boundary`() {
        val request = MockHttpServletRequest().also { it.remoteAddr = "192.0.2.1"; it.addHeader("X-Forwarded-For", "198.51.100.7") }
        assertThat(limiter(false).client(request)).isEqualTo("192.0.2.1")
        assertThat(limiter(true).client(request)).isEqualTo("198.51.100.7")
    }

    @Test fun `trusted ingress accepts a single IP literal and rejects lists duplicates and hostnames`() {
        for (value in listOf("198.51.100.7, 192.0.2.1", "example.invalid", "deadbeef", "999.1.2.3", "[::1]")) {
            val request = MockHttpServletRequest().also { it.remoteAddr = "192.0.2.1"; it.addHeader("X-Forwarded-For", value) }
            assertThat(limiter(true).client(request)).isEqualTo("192.0.2.1")
        }
        val duplicate = MockHttpServletRequest().also {
            it.remoteAddr = "192.0.2.1"; it.addHeader("X-Forwarded-For", "198.51.100.7"); it.addHeader("X-Forwarded-For", "203.0.113.1")
        }
        assertThat(limiter(true).client(duplicate)).isEqualTo("192.0.2.1")
    }
}
