package se.forena.api

import com.tngtech.archunit.core.importer.ClassFileImporter
import com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes
import com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.data.relational.core.mapping.Table
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.modulith.core.ApplicationModules
import org.springframework.modulith.docs.Documenter
import org.springframework.stereotype.Service

class ArchitectureTest {
    @Test
    fun `services use repositories instead of issuing SQL through JdbcClient`() {
        val code = ClassFileImporter().importPackages("se.forena.api")
        noClasses()
            .that()
            .areAnnotatedWith(Service::class.java)
            .should()
            .dependOnClassesThat()
            .areAssignableTo(JdbcClient::class.java)
            .check(code)
    }

    @Test
    fun `table mappings use Entity and application code uses existing exception types`() {
        val code = ClassFileImporter().importPackages("se.forena.api")
        classes()
            .that()
            .areAnnotatedWith(Table::class.java)
            .should()
            .haveSimpleNameEndingWith("Entity")
            .check(code)
        noClasses()
            .that()
            .resideInAPackage("se.forena.api..")
            .should()
            .beAssignableTo(RuntimeException::class.java)
            .check(code)
    }

    @Test
    fun `identity and activities form valid modules including email`() {
        val modules = ApplicationModules.of(ForenaApplication::class.java)
        assertThat(modules.stream().map { it.identifier.toString() }.toList())
            .contains("identity", "activities", "email")
        modules.verify()
        Documenter(modules).writeDocumentation()
    }
}
