package se.forena.api.identity.authentication

import jakarta.servlet.FilterChain
import jakarta.servlet.ReadListener
import jakarta.servlet.ServletInputStream
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletRequestWrapper
import jakarta.servlet.http.HttpServletResponse
import java.io.BufferedReader
import java.io.ByteArrayInputStream
import java.io.InputStreamReader
import org.springframework.web.filter.OncePerRequestFilter

/** Bounds the MCP body before the transport reads it, including requests without Content-Length. */
class McpRequestFilter : OncePerRequestFilter() {
    override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain) {
        response.setHeader("Cache-Control", "no-store")
        if (request.method != "POST") {
            chain.doFilter(request, response)
            return
        }
        if (request.contentLengthLong > MAX_BODY_BYTES) {
            response.status = 413
            return
        }
        val body = request.inputStream.readNBytes(MAX_BODY_BYTES + 1)
        if (body.size > MAX_BODY_BYTES) {
            response.status = 413
            return
        }
        chain.doFilter(BufferedMcpRequest(request, body), response)
    }

    private companion object {
        const val MAX_BODY_BYTES = 64 * 1024
    }
}

private class BufferedMcpRequest(request: HttpServletRequest, private val body: ByteArray) : HttpServletRequestWrapper(request) {
    override fun getContentLength(): Int = body.size

    override fun getContentLengthLong(): Long = body.size.toLong()

    override fun getInputStream(): ServletInputStream = BufferedMcpInputStream(body)

    override fun getReader(): BufferedReader = BufferedReader(InputStreamReader(inputStream, characterEncoding ?: "UTF-8"))
}

/** The WebMVC stateless MCP transport consumes the body synchronously. */
private class BufferedMcpInputStream(body: ByteArray) : ServletInputStream() {
    private val source = ByteArrayInputStream(body)

    override fun read(): Int = source.read()

    override fun read(bytes: ByteArray, offset: Int, length: Int): Int = source.read(bytes, offset, length)

    override fun isFinished(): Boolean = source.available() == 0

    override fun isReady(): Boolean = true

    override fun setReadListener(listener: ReadListener) {
        throw IllegalStateException("MCP request bodies are read synchronously")
    }
}
