package se.forena.api

import org.springframework.security.oauth2.core.OAuth2AuthenticationException
import java.net.SocketTimeoutException
import javax.net.ssl.SSLHandshakeException
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith
import org.springframework.boot.test.system.CapturedOutput
import org.springframework.boot.test.system.OutputCaptureExtension
import org.springframework.security.oauth2.jwt.BadJwtException
import org.springframework.security.oauth2.jwt.JwtDecoder
import org.springframework.security.oauth2.jwt.JwtException
import org.springframework.web.client.ResourceAccessException
import se.forena.api.identity.AuthJwtDecoder

@ExtendWith(OutputCaptureExtension::class)
class AuthJwtDecoderTest {
    @Test fun `TLS failure is unavailable and diagnostics contain no credentials`(output: CapturedOutput) {
        val secret = "synthetic-private-token-and-url"
        val decoder = AuthJwtDecoder(JwtDecoder {
            throw JwtException(secret, ResourceAccessException(secret, SSLHandshakeException(secret)))
        })
        assertThatThrownBy { decoder.decode(secret) }.isInstanceOf(OAuth2AuthenticationException::class.java)
        assertThat(output.out).contains("api_auth_failed stage=jwt reason=jwks_tls").doesNotContain(secret)
    }

    @Test fun `timeout does not become an invalid session`(output: CapturedOutput) {
        val decoder = AuthJwtDecoder(JwtDecoder {
            throw JwtException("private diagnostic", ResourceAccessException("private URL", SocketTimeoutException()))
        })
        assertThatThrownBy { decoder.decode("private-token") }.isInstanceOf(OAuth2AuthenticationException::class.java)
        assertThat(output.out).contains("reason=jwks_timeout").doesNotContain("private")
    }

    @Test fun `bad token remains rejected with no exception text or bearer in diagnostics`(output: CapturedOutput) {
        val decoder = AuthJwtDecoder(JwtDecoder { throw BadJwtException("private diagnostic") })
        assertThatThrownBy { decoder.decode("private-token") }.isInstanceOf(BadJwtException::class.java)
            .hasMessage("Token could not be verified")
        assertThat(output.out).contains("reason=invalid_token").doesNotContain("private")
    }
}
