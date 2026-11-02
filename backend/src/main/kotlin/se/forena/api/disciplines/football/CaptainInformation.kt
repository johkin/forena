package se.forena.api.disciplines.football

import java.util.UUID
import se.forena.api.extensionapi.*
import tools.jackson.databind.JsonNode

class CaptainInformation : InformationContributor {
    override val information =
        InformationDefinition(
            "actualCaptain",
            "1.0.0",
            "Faktisk lagkapten",
            listOf(DisciplineField("actualCaptainPersonId", "Faktisk lagkapten", FieldType.player)),
        )

    override fun validate(values: JsonNode, presentPlayerIds: Set<UUID>) {
        DisciplineValidation.validate(information.fields, values)
        require(referencedPlayers(values).all { it in presentPlayerIds })
    }

    override fun complete(values: JsonNode) = values.has("actualCaptainPersonId")

    override fun referencedPlayers(values: JsonNode) =
        values
            .get("actualCaptainPersonId")
            ?.let { setOf(UUID.fromString(it.stringValue())) }
            .orEmpty()
}
