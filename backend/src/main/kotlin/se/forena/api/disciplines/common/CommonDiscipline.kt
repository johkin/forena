package se.forena.api.disciplines.common

import org.springframework.stereotype.Component
import se.forena.api.extensionapi.*
import tools.jackson.databind.JsonNode

@Component
class CommonDiscipline : DisciplinePackage {
    override val definition =
        DisciplineDefinition("common", "1.0.0", "Allmän verksamhet", "other", emptyMap())

    override fun appliesTo(kind: ActivityKind) = false

    override fun validate(
        scope: DisciplineScope,
        values: JsonNode,
        context: DisciplineValidationContext,
    ) {
        require(values.isObject && values.isEmpty)
    }

    override fun initialActivityValues(teamValues: JsonNode): JsonNode = teamValues.deepCopy()
}
