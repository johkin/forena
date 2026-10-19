package se.forena.api

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.modulith.core.ApplicationModules
import org.springframework.modulith.docs.Documenter

class ArchitectureTest {
    @Test fun `identity and activities form valid modules`() {
        val modules = ApplicationModules.of(ForenaApplication::class.java)
        assertThat(modules.stream().map { it.identifier.toString() }.toList()).contains("identity", "activities")
        modules.verify()
        Documenter(modules).writeDocumentation()
    }
}
