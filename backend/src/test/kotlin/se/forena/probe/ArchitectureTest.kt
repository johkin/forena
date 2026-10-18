package se.forena.probe

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.modulith.core.ApplicationModules
import org.springframework.modulith.docs.Documenter

class ArchitectureTest {
    @Test
    fun `module dependencies are valid and architecture is generated`() {
        val modules = ApplicationModules.of(ProbeApplication::class.java)
        assertThat(modules.stream().map { it.identifier.toString() }.toList()).contains("commands", "effects", "transport")
        modules.verify()
        Documenter(modules).writeDocumentation()
    }
}
