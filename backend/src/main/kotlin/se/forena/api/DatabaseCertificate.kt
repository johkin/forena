package se.forena.api

import java.nio.file.Files
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate

/** The public CA arrives as runtime configuration; the buildpack image is unchanged. */
internal fun databaseUrlWithCertificate(url: String?, pem: String?): String? {
    if (pem.isNullOrBlank()) return null
    require(url != null && url.startsWith("jdbc:postgresql://")) { "Database CA requires a PostgreSQL URL" }
    val certificates = pem.byteInputStream().use { CertificateFactory.getInstance("X.509").generateCertificates(it) }
    require(certificates.isNotEmpty() && certificates.all { it is X509Certificate && it.basicConstraints >= 0 }) {
        "Database CA must contain CA certificates"
    }
    val file = Files.createTempFile("forena-db-ca-", ".crt")
    Files.writeString(file, pem)
    file.toFile().deleteOnExit()
    val parameter = "sslrootcert=$file"
    return if (Regex("([?&])sslrootcert=[^&]*").containsMatchIn(url)) {
        url.replace(Regex("([?&])sslrootcert=[^&]*")) { it.groupValues[1] + parameter }
    } else url + (if ('?' in url) "&" else "?") + parameter
}
