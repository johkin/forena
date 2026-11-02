package se.forena.api.extensionapi

import tools.jackson.databind.JsonNode

/** Reusable contributions: a capability implements only the extension points it needs. */
interface DisciplineCapability {
    val definition: CapabilityDefinition

    fun fields(scope: DisciplineScope): List<DisciplineField>

    fun validate(scope: DisciplineScope, values: JsonNode)
}
