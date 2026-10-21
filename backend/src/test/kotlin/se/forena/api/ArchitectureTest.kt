package se.forena.api

import org.assertj.core.api.Assertions.assertThat
import com.tngtech.archunit.core.importer.ClassFileImporter
import com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes
import com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses
import org.springframework.data.relational.core.mapping.Table
import org.junit.jupiter.api.Test
import org.springframework.modulith.core.ApplicationModules
import org.springframework.modulith.docs.Documenter

class ArchitectureTest {
    @Test fun `table mappings use Entity and application code uses existing exception types`() {
        val code = ClassFileImporter().importPackages("se.forena.api")
        classes().that().areAnnotatedWith(Table::class.java).should().haveSimpleNameEndingWith("Entity").check(code)
        noClasses().that().resideInAPackage("se.forena.api..")
            .should().beAssignableTo(RuntimeException::class.java).check(code)
    }

    @Test fun `identity and activities form valid modules`() {
        val modules = ApplicationModules.of(ForenaApplication::class.java)
        assertThat(modules.stream().map { it.identifier.toString() }.toList()).contains("identity", "activities")
        modules.verify()
        Documenter(modules).writeDocumentation()
    }
}
