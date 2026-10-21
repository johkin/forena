package se.forena.api

import com.sun.net.httpserver.HttpsConfigurator
import com.sun.net.httpserver.HttpsServer
import java.net.InetSocketAddress
import java.nio.file.Files
import java.nio.file.Path
import java.security.KeyStore
import javax.net.ssl.KeyManagerFactory
import javax.net.ssl.SSLContext
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import org.springframework.web.client.ResourceAccessException
import org.springframework.web.client.RestTemplate
import se.forena.api.identity.AuthHttpRequestFactory

class AuthTlsTest {
    @TempDir lateinit var directory: Path
    private lateinit var server: HttpsServer
    private lateinit var ca: Path

    @BeforeEach fun start() {
        val password = "synthetic-tls-only"
        val storePath = directory.resolve("server.p12")
        ca = directory.resolve("ca.pem")
        fun keytool(vararg args: String) {
            val result = ProcessBuilder(listOf(Path.of(System.getProperty("java.home"), "bin/keytool").toString()) + args)
                .redirectErrorStream(true).redirectOutput(directory.resolve("keytool.log").toFile()).start()
            check(result.waitFor(15, java.util.concurrent.TimeUnit.SECONDS) && result.exitValue() == 0)
        }
        // Fresh synthetic CA/server key per test; never use a production key.
        keytool("-genkeypair", "-alias", "test", "-keyalg", "RSA", "-keysize", "2048", "-validity", "2",
            "-dname", "CN=localhost", "-ext", "SAN=dns:localhost", "-ext", "BC=ca:true",
            "-keystore", storePath.toString(), "-storetype", "PKCS12", "-storepass", password, "-noprompt")
        keytool("-exportcert", "-rfc", "-alias", "test", "-keystore", storePath.toString(),
            "-storepass", password, "-file", ca.toString())
        val store = KeyStore.getInstance("PKCS12").also { keyStore ->
            Files.newInputStream(storePath).use { keyStore.load(it, password.toCharArray()) }
        }
        val keys = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm())
            .also { it.init(store, password.toCharArray()) }
        val tls = SSLContext.getInstance("TLS").also { it.init(keys.keyManagers, null, null) }
        server = HttpsServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.httpsConfigurator = HttpsConfigurator(tls)
        server.createContext("/auth") { exchange ->
            val bytes = "verified".toByteArray()
            exchange.sendResponseHeaders(200, bytes.size.toLong())
            exchange.responseBody.use { it.write(bytes) }
        }
        server.start()
    }

    @AfterEach fun stop() { if (::server.isInitialized) server.stop(0) }

    @Test fun `platform CA enables HTTPS that Java and OS roots alone reject`() {
        val url = "https://localhost:${server.address.port}/auth"
        assertThatThrownBy { RestTemplate(AuthHttpRequestFactory("", "")).getForObject(url, String::class.java) }
            .isInstanceOf(ResourceAccessException::class.java)
        for (bundles in listOf(ca.toString() to "", "" to ca.toString(), ca.toString() to ca.toString())) {
            assertThat(RestTemplate(AuthHttpRequestFactory(bundles.first, bundles.second)).getForObject(url, String::class.java))
                .isEqualTo("verified")
        }
    }

    @Test fun `trusted CA does not disable hostname verification`() {
        assertThatThrownBy {
            RestTemplate(AuthHttpRequestFactory(ca.toString(), ""))
                .getForObject("https://127.0.0.1:${server.address.port}/auth", String::class.java)
        }.isInstanceOf(ResourceAccessException::class.java)
    }

    @Test fun `configured missing malformed and relative bundles fail closed`() {
        val malformed = directory.resolve("malformed.pem").also { Files.writeString(it, "not a certificate") }
        for (path in listOf(directory.resolve("missing.pem").toString(), malformed.toString())) {
            assertThatThrownBy { AuthHttpRequestFactory(path, "") }.isInstanceOf(IllegalStateException::class.java)
                .hasMessage("Auth CA bundle could not be loaded")
                .describedAs("invalid bundle: %s", path)
        }
        assertThatThrownBy { AuthHttpRequestFactory("", malformed.toString()) }
            .isInstanceOf(IllegalStateException::class.java).hasMessage("Auth CA bundle could not be loaded")
        assertThatThrownBy { AuthHttpRequestFactory("relative.pem", "") }
            .isInstanceOf(IllegalArgumentException::class.java)
            .hasMessage("Auth CA bundle path must be absolute")
    }
}
