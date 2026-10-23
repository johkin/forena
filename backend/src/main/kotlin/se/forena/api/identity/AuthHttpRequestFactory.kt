package se.forena.api.identity

import java.net.HttpURLConnection
import java.nio.file.Files
import java.nio.file.Path
import java.security.KeyStore
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.time.Duration
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.client.SimpleClientHttpRequestFactory
import org.springframework.stereotype.Component

/** Auth HTTPS uses Java's roots plus the container/platform CA bundles.
 * The default hostname verifier remains enabled; trust is never learned from peers. */
@Component
class AuthHttpRequestFactory(
    @Value("\${FORENA_AUTH_CA_BUNDLE:\${SSL_CERT_FILE:}}") caBundle: String,
    @Value("\${FORENA_AUTH_EXTRA_CA_BUNDLE:\${NODE_EXTRA_CA_CERTS:}}") extraBundle: String
) : SimpleClientHttpRequestFactory() {
    private val logger = LoggerFactory.getLogger(AuthHttpRequestFactory::class.java)

    private val sockets = sslContext(listOf(caBundle, extraBundle)).socketFactory

    init {
        setConnectTimeout(Duration.ofSeconds(2))
        setReadTimeout(Duration.ofSeconds(2))
    }

    override fun prepareConnection(connection: HttpURLConnection, httpMethod: String) {
        super.prepareConnection(connection, httpMethod)
        connection.instanceFollowRedirects = false
        if (connection is HttpsURLConnection) connection.sslSocketFactory = sockets
    }

    private fun sslContext(extraBundles: List<String>): SSLContext {
        val defaults = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm())
            .also { it.init(null as KeyStore?) }
        val javaRoots = defaults.trustManagers.filterIsInstance<X509TrustManager>().flatMap { it.acceptedIssuers.toList() }
        val store = KeyStore.getInstance(KeyStore.getDefaultType()).also { it.load(null, null) }
        var count = 0
        for (cert in javaRoots) store.setCertificateEntry("java-${count++}", cert)

        fun addBundle(path: Path): Int {
            val certificates = runCatching {
                Files.newInputStream(path).use { CertificateFactory.getInstance("X.509").generateCertificates(it) }
            }.getOrElse { error("Auth CA bundle could not be loaded") }
            require(certificates.isNotEmpty() && certificates.all { it is X509Certificate && it.basicConstraints >= 0 }) {
                "Auth CA bundle must contain CA certificates"
            }
            certificates.forEach { store.setCertificateEntry("bundle-${count++}", it) }
            return certificates.size
        }
        val systemBundle = Path.of("/etc/ssl/certs/ca-certificates.crt")
        val systemCount = if (Files.exists(systemBundle)) addBundle(systemBundle) else 0
        val extraCount = extraBundles.filter { it.isNotBlank() }.distinct().sumOf { bundle ->
            val path = Path.of(bundle)
            require(path.isAbsolute) { "Auth CA bundle path must be absolute" }
            addBundle(path)
        }
        require(count > 0) { "Auth HTTPS requires trusted CA certificates" }
        val managers = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()).also { it.init(store) }
        logger.info(
            "auth_tls_trust_loaded java_ca_count={} system_ca_count={} extra_ca_count={}", javaRoots.size, systemCount, extraCount)
        return SSLContext.getInstance("TLS").also { it.init(null, managers.trustManagers, null) }
    }
}
