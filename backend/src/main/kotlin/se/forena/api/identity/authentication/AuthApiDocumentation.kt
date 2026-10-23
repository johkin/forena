package se.forena.api.identity.authentication

import io.swagger.v3.core.converter.AnnotatedType
import io.swagger.v3.core.converter.ModelConverters
import io.swagger.v3.oas.models.Operation
import io.swagger.v3.oas.models.PathItem
import io.swagger.v3.oas.models.headers.Header
import io.swagger.v3.oas.models.media.Content
import io.swagger.v3.oas.models.media.IntegerSchema
import io.swagger.v3.oas.models.media.MediaType
import io.swagger.v3.oas.models.media.ObjectSchema
import io.swagger.v3.oas.models.media.Schema
import io.swagger.v3.oas.models.media.StringSchema
import io.swagger.v3.oas.models.parameters.PathParameter
import io.swagger.v3.oas.models.parameters.RequestBody
import io.swagger.v3.oas.models.responses.ApiResponse
import io.swagger.v3.oas.models.responses.ApiResponses
import io.swagger.v3.oas.models.security.SecurityRequirement
import io.swagger.v3.oas.models.security.SecurityScheme
import java.lang.reflect.Type
import org.springdoc.core.customizers.OpenApiCustomizer
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import se.forena.api.http.ApiError
import se.forena.api.identity.BrowserSessionSettings

@Configuration(proxyBeanMethods = false)
class AuthApiDocumentation {
    @Bean fun apiSecurity(settings: BrowserSessionSettings) = OpenApiCustomizer { api ->
        fun schema(type: Type): Schema<*> {
            val resolved = ModelConverters.getInstance().resolveAsResolvedSchema(
                AnnotatedType(type).resolveAsRef(true))
            resolved.referencedSchemas.forEach { (name, value) -> api.components.addSchemas(name, value) }
            return resolved.schema
        }
        for (endpoint in AuthenticationEndpoints.all) {
            val operation = Operation().operationId(endpoint.operation)
                .description("Spring Security filter endpoint. Uses Spring payloads. Requires canonical Origin and X-Forena-Request: 1 for POST.")
            endpoint.request?.let { type -> operation.requestBody(RequestBody().required(true)
                .content(Content().addMediaType(if (endpoint.form) "application/x-www-form-urlencoded" else "application/json",
                    MediaType().schema(schema(type))))) }
            operation.responses(ApiResponses().addApiResponse("200",
                ApiResponse().description("Success").content(
                    Content().addMediaType("application/json",
                        MediaType().schema(schema(endpoint.response))))))
            api.path(endpoint.path, PathItem().post(operation))
        }
        api.path("/api/auth/passkeys/{id}", PathItem().delete(
            Operation().operationId("deletePasskey").description("Spring WebAuthn filter; credential owner only.")
                .addParametersItem(PathParameter().name("id").required(true)
                    .schema(StringSchema()))
                .responses(ApiResponses().addApiResponse("204",
                    ApiResponse().description("Credential removed")))))
        // springdoc's model resolver uses Jackson 2; Security 7 serializes these with Jackson 3 mixins.
        api.components.addSchemas("Bytes", StringSchema().format("base64url"))
        for (name in listOf("AttestationConveyancePreference", "AuthenticatorAttachment", "AuthenticatorTransport",
            "PublicKeyCredentialType", "ResidentKeyRequirement", "UserVerificationRequirement")) {
            api.components.addSchemas(name, StringSchema())
        }
        api.components.addSchemas("COSEAlgorithmIdentifier", IntegerSchema())
        for (name in listOf("PublicKeyCredentialRequestOptions", "PublicKeyCredentialCreationOptions")) {
            api.components.schemas[name]?.properties?.set("timeout", IntegerSchema().format("int64"))
        }
        for (name in listOf("AuthenticationExtensionsClientInputs", "AuthenticationExtensionsClientOutputs")) {
            api.components.addSchemas(name, ObjectSchema().additionalProperties(true))
        }
        api.components.securitySchemes = mapOf("cookie" to SecurityScheme().type(SecurityScheme.Type.APIKEY)
            .`in`(SecurityScheme.In.COOKIE).name(settings.cookieName).description("Opaque HttpOnly browser session; never a provider token."))
        api.security = listOf(SecurityRequirement().addList("cookie"))
        val publicRoutes = setOf("/api/auth/login", "/api/auth/logout", "/api/auth/register", "/api/auth/email/verify",
            "/api/auth/password/reset-request", "/api/auth/password/reset", "/api/auth/magic-link", "/api/auth/magic-link/verify",
            "/api/auth/passkey/options", "/api/auth/passkey/verify")
        api.paths.forEach { (path, item) -> item.readOperations().forEach { operation ->
            if (path in publicRoutes) operation.security = emptyList()
            if (path.startsWith("/api/auth/")) {
                for ((status, description) in mapOf("400" to "Invalid request", "401" to "Inactive session or invalid credential",
                    "403" to "Origin or account access denied", "503" to "Temporary verification failure")) {
                    operation.responses.addApiResponse(status, ApiResponse().description(description)
                        .content(Content().addMediaType("application/json", MediaType().schema(schema(ApiError::class.java)))))
                }
                if (path !in setOf("/api/auth/logout", "/api/auth/session", "/api/auth/passkeys", "/api/auth/continue", "/api/auth/oauth/consent")) operation.responses.addApiResponse("429", ApiResponse().description("Shared admission budget exhausted")
                    .addHeaderObject("Retry-After", Header().description("Seconds until retry").schema(IntegerSchema())))
            }
        } }
    }
}
