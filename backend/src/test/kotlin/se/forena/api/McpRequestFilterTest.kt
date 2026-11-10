package se.forena.api

import jakarta.servlet.http.HttpServletRequest
import java.io.ByteArrayInputStream
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.mock.web.DelegatingServletInputStream
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import se.forena.api.identity.authentication.McpRequestFilter

class McpRequestFilterTest {
    private val origin = "https://app.example.invalid"
    private val filter = McpRequestFilter()

    @Test fun `unknown length UTF-8 body at byte limit is replayed unchanged`() {
        val body = "å".repeat(32 * 1024).toByteArray(Charsets.UTF_8)
        val request = unknownLengthRequest(ByteArrayInputStream(body))
        request.addHeader("Origin", origin)
        val response = MockHttpServletResponse()
        var replayed: ByteArray? = null

        filter.doFilter(request, response) { forwarded, _ ->
            replayed = forwarded.inputStream.readAllBytes()
            val buffered = forwarded as HttpServletRequest
            assertThat(buffered.contentLengthLong).isEqualTo(body.size.toLong())
            assertThat(buffered.getHeader("Origin")).isEqualTo(origin)
        }

        assertThat(response.status).isEqualTo(200)
        assertThat(response.getHeader("Cache-Control")).isEqualTo("no-store")
        assertThat(replayed).isEqualTo(body)
    }

    @Test fun `unknown length oversized body is rejected after bounded read`() {
        val body = ByteArray(128 * 1024)
        val source = ByteArrayInputStream(body)
        val request = unknownLengthRequest(source)
        val response = MockHttpServletResponse()
        var forwarded = false

        filter.doFilter(request, response) { _, _ -> forwarded = true }

        assertThat(forwarded).isFalse()
        assertThat(response.status).isEqualTo(413)
        assertThat(source.available()).isEqualTo(body.size - 64 * 1024 - 1)
        assertThat(response.contentAsByteArray).isEmpty()
    }

    private fun unknownLengthRequest(source: ByteArrayInputStream): MockHttpServletRequest =
        object : MockHttpServletRequest("POST", "/api/mcp") {
            override fun getContentLength(): Int = -1
            override fun getContentLengthLong(): Long = -1
            override fun getInputStream() = DelegatingServletInputStream(source)
        }
}
