package se.forena.api.capabilities.greencard

import java.util.UUID
import org.springframework.stereotype.Component
import se.forena.api.extensionapi.*
import tools.jackson.databind.JsonNode

@Component("greenCard")
class GreenCardCapability : InformationCapability {
    override val definition =
        CapabilityDefinition("greenCard", "1.0.0", "Gröna kortet", false, true)
    override val information =
        InformationDefinition(
            "greenCard",
            "1.0.0",
            "Gröna kortet",
            listOf(
                DisciplineField(
                    "outcome",
                    "Delades Gröna kortet ut?",
                    FieldType.choice,
                    options =
                        listOf(
                            FieldOption("none", "Inget kort utdelat"),
                            FieldOption("awarded", "Kort utdelat"),
                        ),
                ),
                DisciplineField(
                    "recipientIds",
                    "Mottagare",
                    FieldType.players,
                    visibleWhen = FieldCondition("outcome", "awarded"),
                ),
            ),
            capabilityKey = definition.key,
        )

    override fun fields(scope: DisciplineScope) = emptyList<DisciplineField>()

    override fun validate(scope: DisciplineScope, values: JsonNode) = Unit

    override fun validate(values: JsonNode, presentPlayerIds: Set<UUID>) {
        DisciplineValidation.validate(information.fields, values)
        val recipients = referencedPlayers(values)
        require(recipients.all { it in presentPlayerIds })
        val outcome = values.get("outcome")?.stringValue()
        require(recipients.isEmpty() || outcome == "awarded")
    }

    override fun complete(values: JsonNode) =
        values.get("outcome")?.stringValue() == "none" ||
            (values.get("outcome")?.stringValue() == "awarded" &&
                referencedPlayers(values).isNotEmpty())

    override fun referencedPlayers(values: JsonNode) =
        values
            .get("recipientIds")
            ?.toList()
            ?.map { UUID.fromString(it.stringValue()) }
            ?.toSet()
            .orEmpty()
}
