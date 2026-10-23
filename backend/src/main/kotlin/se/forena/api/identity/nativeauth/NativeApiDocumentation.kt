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
        fun schema(type: java.lang.reflect.Type): io.swagger.v3.oas.models.media.Schema<*> {
            val resolved = io.swagger.v3.core.converter.ModelConverters.getInstance().resolveAsResolvedSchema(
                io.swagger.v3.core.converter.AnnotatedType(type).resolveAsRef(true))
            resolved.referencedSchemas.forEach { (name, value) -> api.components.addSchemas(name, value) }
            return resolved.schema
        }
        for (endpoint in NativeAuthenticationEndpoints.all) {
            val operation = io.swagger.v3.oas.models.Operation().operationId(endpoint.operation)
                .description("Spring Security filter endpoint. Uses Spring payloads. Requires canonical Origin and X-Forena-Request: 1 for POST.")
            endpoint.request?.let { type -> operation.requestBody(io.swagger.v3.oas.models.parameters.RequestBody().required(true)
                .content(io.swagger.v3.oas.models.media.Content().addMediaType(if (endpoint.form) "application/x-www-form-urlencoded" else "application/json",
                    io.swagger.v3.oas.models.media.MediaType().schema(schema(type))))) }
            operation.responses(io.swagger.v3.oas.models.responses.ApiResponses().addApiResponse("200",
                io.swagger.v3.oas.models.responses.ApiResponse().description("Success").content(
                    io.swagger.v3.oas.models.media.Content().addMediaType("application/json",
                        io.swagger.v3.oas.models.media.MediaType().schema(schema(endpoint.response))))))
            api.path(endpoint.path, io.swagger.v3.oas.models.PathItem().post(operation))
        }
        api.path("/api/auth/passkeys/{id}", io.swagger.v3.oas.models.PathItem().delete(
            io.swagger.v3.oas.models.Operation().operationId("deletePasskey").description("Spring WebAuthn filter; credential owner only.")
                .addParametersItem(io.swagger.v3.oas.models.parameters.PathParameter().name("id").required(true)
                    .schema(io.swagger.v3.oas.models.media.StringSchema()))
                .responses(io.swagger.v3.oas.models.responses.ApiResponses().addApiResponse("204",
                    io.swagger.v3.oas.models.responses.ApiResponse().description("Credential removed")))))
        // springdoc's model resolver uses Jackson 2; Security 7 serializes these with Jackson 3 mixins.
        api.components.addSchemas("Bytes", io.swagger.v3.oas.models.media.StringSchema().format("base64url"))
        for (name in listOf("AttestationConveyancePreference", "AuthenticatorAttachment", "AuthenticatorTransport",
            "PublicKeyCredentialType", "ResidentKeyRequirement", "UserVerificationRequirement")) {
            api.components.addSchemas(name, io.swagger.v3.oas.models.media.StringSchema())
        }
        api.components.addSchemas("COSEAlgorithmIdentifier", io.swagger.v3.oas.models.media.IntegerSchema())
        for (name in listOf("PublicKeyCredentialRequestOptions", "PublicKeyCredentialCreationOptions")) {
            api.components.schemas[name]?.properties?.set("timeout", io.swagger.v3.oas.models.media.IntegerSchema().format("int64"))
        }
        for (name in listOf("AuthenticationExtensionsClientInputs", "AuthenticationExtensionsClientOutputs")) {
            api.components.addSchemas(name, io.swagger.v3.oas.models.media.ObjectSchema().additionalProperties(true))
        }
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
