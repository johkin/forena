package se.forena.api.activities

import tools.jackson.core.JsonParser
import tools.jackson.core.JsonToken
import tools.jackson.databind.DeserializationContext
import tools.jackson.databind.ValueDeserializer

/** A participant limit cannot silently round a decimal or parse a string. */
class StrictIntegerDeserializer : ValueDeserializer<Int>() {
    override fun deserialize(parser: JsonParser, context: DeserializationContext): Int =
        if (parser.currentToken() == JsonToken.VALUE_NUMBER_INT) parser.intValue
        else context.reportInputMismatch(Int::class.java, "Expected a JSON integer or null")
}
