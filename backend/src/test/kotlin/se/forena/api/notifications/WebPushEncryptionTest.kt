package se.forena.api.notifications

import java.security.KeyPairGenerator
import java.security.Security
import java.util.Base64
import nl.martijndwars.webpush.Notification
import nl.martijndwars.webpush.Utils
import org.assertj.core.api.Assertions.assertThat
import org.bouncycastle.jce.interfaces.ECPrivateKey
import org.bouncycastle.jce.interfaces.ECPublicKey
import org.bouncycastle.jce.provider.BouncyCastleProvider
import org.bouncycastle.jce.spec.ECNamedCurveGenParameterSpec
import org.junit.jupiter.api.Test

class WebPushEncryptionTest {
    @Test
    fun `push payload is encrypted using aes128gcm and VAPID before any HTTP request`() {
        if (Security.getProvider("BC") == null) Security.addProvider(BouncyCastleProvider())
        val generator = KeyPairGenerator.getInstance("ECDH", "BC")
        generator.initialize(ECNamedCurveGenParameterSpec("prime256v1"))
        val vapid = generator.generateKeyPair()
        val subscriber = generator.generateKeyPair()
        val base64 = Base64.getUrlEncoder().withoutPadding()
        val encryption =
            PushEncryption(
                base64.encodeToString(Utils.encode(vapid.public as ECPublicKey)),
                base64.encodeToString(Utils.encode(vapid.private as ECPrivateKey)),
                "mailto:test@example.invalid",
            )
        val payload = "Private notification data"
        val request =
            encryption.prepare(
                Notification(
                    "https://fcm.googleapis.com/fcm/send/synthetic",
                    base64.encodeToString(Utils.encode(subscriber.public as ECPublicKey)),
                    base64.encodeToString(ByteArray(16) { 9 }),
                    payload,
                )
            )
        assertThat(request.headers["Content-Encoding"]).isEqualTo("aes128gcm")
        assertThat(request.headers["Authorization"]).startsWith("vapid ")
        assertThat(String(request.body, Charsets.ISO_8859_1)).doesNotContain(payload)
        assertThat(request.body.size).isGreaterThan(payload.length)
    }
}
