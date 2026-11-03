package se.forena.api.extensionapi

import java.util.UUID
import tools.jackson.databind.JsonNode

/** Schema checks shared by packages; contextual domain checks belong to the package. */
object DisciplineValidation {
    fun validate(fields: List<DisciplineField>, values: JsonNode) {
        require(values.isObject)
        val byKey = fields.associateBy { it.key }
        values.properties().forEach { (key, value) ->
            val field = requireNotNull(byKey[key]) { "Unknown discipline field" }
            when (field.type) {
                FieldType.integer -> {
                    require(value.isIntegralNumber && value.canConvertToInt())
                    val number = value.intValue()
                    require(field.minimum == null || number >= field.minimum)
                    require(field.maximum == null || number <= field.maximum)
                }
                FieldType.choice ->
                    require(value.isString && field.options.any { it.id == value.stringValue() })
                FieldType.choices -> {
                    require(value.isArray)
                    val selected = value.toList()
                    require(
                        selected.all { option ->
                            option.isString && field.options.any { it.id == option.stringValue() }
                        }
                    )
                    require(selected.distinct().size == selected.size)
                }
                FieldType.player -> {
                    require(value.isString)
                    require(
                        UUID.fromString(value.stringValue()).toString() ==
                            value.stringValue().lowercase()
                    )
                }
                FieldType.players -> {
                    require(value.isArray)
                    val ids =
                        value.toList().map { entry ->
                            require(entry.isString)
                            UUID.fromString(entry.stringValue())
                        }
                    require(ids.size == ids.distinct().size)
                }
            }
        }
    }
}
