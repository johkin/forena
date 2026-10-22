package se.forena.api.identity.nativeauth

import io.swagger.v3.oas.models.security.SecurityRequirement
import io.swagger.v3.oas.models.security.SecurityScheme
import org.springdoc.core.customizers.OpenApiCustomizer
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import se.forena.api.identity.BrowserSessionSettings

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = ["forena.auth.mode"], havingValue = "native")
class NativeApiDocumentation {
    @Bean fun nativeApiSecurity(settings: BrowserSessionSettings) = OpenApiCustomizer { api ->
        api.components.securitySchemes = mapOf("cookie" to SecurityScheme().type(SecurityScheme.Type.APIKEY)
            .`in`(SecurityScheme.In.COOKIE).name(settings.cookieName).description("Opaque HttpOnly browser session; never a provider token."))
        api.security = listOf(SecurityRequirement().addList("cookie"))
        val publicRoutes = setOf("/api/auth/login", "/api/auth/logout", "/api/auth/register", "/api/auth/email/verify",
            "/api/auth/password/reset-request", "/api/auth/password/reset", "/api/auth/magic-link", "/api/auth/magic-link/verify",
            "/api/auth/passkey/options", "/api/auth/passkey/verify")
        api.paths.forEach { (path, item) -> item.readOperations().forEach { operation ->
            if (path in publicRoutes) operation.security = emptyList()
        } }
    }
}
