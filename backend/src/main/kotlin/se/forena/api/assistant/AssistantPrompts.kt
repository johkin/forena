package se.forena.api.assistant

import java.nio.charset.StandardCharsets.UTF_8
import org.springframework.beans.factory.annotation.Value
import org.springframework.core.io.Resource
import org.springframework.stereotype.Component

/** Shared, immutable system instructions loaded once from packaged UTF-8 resources. */
@Component
class AssistantPrompts(
    @Value("classpath:prompts/assistant.md") rulesResource: Resource,
    @Value("classpath:prompts/routing.md") routingResource: Resource,
) {
    val rules = rulesResource.getContentAsString(UTF_8).trim()
    val routing = routingResource.getContentAsString(UTF_8).trim()

    init {
        require(rules.isNotBlank() && routing.isNotBlank()) {
            "Assistant prompts must not be blank"
        }
    }
}
