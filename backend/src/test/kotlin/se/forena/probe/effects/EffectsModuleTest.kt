package se.forena.probe.effects

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.modulith.test.ApplicationModuleTest
import se.forena.probe.DatabaseTest
import java.util.UUID

@ApplicationModuleTest(extraIncludes = ["commands"])
class EffectsModuleTest : DatabaseTest() {
    @Autowired lateinit var effects: EffectControl
    @Test
    fun `effects module exposes its read contract without HTTP`() {
        assertThat(effects.status(UUID.randomUUID()).completedAt).isNull()
    }
}
