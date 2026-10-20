package se.forena.api

import java.nio.file.Files
import java.nio.file.Path
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test

class DatabaseCertificateTest {
    @Test fun `runtime CA replaces the old container path and preserves TLS verification`() {
        val pem = Files.readString(Path.of("../certs/supabase-ca.crt"))
        val url = databaseUrlWithCertificate("jdbc:postgresql://db.test/postgres?sslmode=verify-full&sslrootcert=/app/supabase-ca.crt", pem)!!
        val file = Path.of(url.substringAfter("sslrootcert="))
        try {
            assertThat(url).startsWith("jdbc:postgresql://db.test/postgres?sslmode=verify-full&sslrootcert=")
            assertThat(Files.readString(file)).isEqualTo(pem)
            assertThat(url).doesNotContain("/app/")
        } finally {
            Files.deleteIfExists(file)
        }
    }

    @Test fun `invalid CA fails without changing the database configuration`() {
        assertThatThrownBy { databaseUrlWithCertificate("jdbc:postgresql://db.test/postgres", "invalid-ca") }
            .isInstanceOf(Exception::class.java)
        assertThat(databaseUrlWithCertificate("jdbc:postgresql://db.test/postgres", null)).isNull()
    }
}
