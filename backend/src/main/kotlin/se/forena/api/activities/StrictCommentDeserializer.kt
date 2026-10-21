package se.forena.api.activities

import tools.jackson.core.JsonParser
import tools.jackson.core.JsonToken
import tools.jackson.databind.DeserializationContext
import tools.jackson.databind.ValueDeserializer

/** Jackson must not coerce JSON numbers/booleans into comment text. */
class StrictCommentDeserializer : ValueDeserializer<String>() {
    override fun deserialize(parser: JsonParser, context: DeserializationContext): String =
        if (parser.currentToken() == JsonToken.VALUE_STRING) parser.string
        else context.reportInputMismatch(String::class.java, "Comment must be a string or null")
}
