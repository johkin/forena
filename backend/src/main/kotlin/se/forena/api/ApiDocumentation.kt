package se.forena.api

import io.swagger.v3.oas.annotations.OpenAPIDefinition
import io.swagger.v3.oas.annotations.info.Info
import io.swagger.v3.oas.annotations.servers.Server
import io.swagger.v3.oas.models.media.ArbitrarySchema
import io.swagger.v3.oas.models.media.DateTimeLocalSchema
import io.swagger.v3.oas.models.media.DurationSchema
import io.swagger.v3.oas.models.media.TimeLocalSchema
import io.swagger.v3.oas.models.media.TimeSchema
import org.springframework.aot.hint.annotation.RegisterReflectionForBinding
import org.springframework.context.annotation.Configuration

// These newer Swagger model types are absent from springdoc 3.1.1's native hints.
@RegisterReflectionForBinding(ArbitrarySchema::class, DateTimeLocalSchema::class,
    DurationSchema::class, TimeLocalSchema::class, TimeSchema::class)
@Configuration
@OpenAPIDefinition(
    info = Info(title = "Förena activities API", version = "0.1.0"),
    servers = [Server(url = "/")]
)
class ApiDocumentation
