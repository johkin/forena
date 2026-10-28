package se.forena.api.telegram

import java.security.MessageDigest
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.annotation.Order
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.core.DefaultOAuth2AuthenticatedPrincipal
import org.springframework.security.oauth2.server.resource.introspection.BadOpaqueTokenException
import org.springframework.security.web.SecurityFilterChain

@Configuration(proxyBeanMethods = false)
class TelegramSecurity {
    @Bean
    @Order(0)
    fun telegramWebhookFilterChain(
        http: HttpSecurity,
        @Value("\${FORENA_TELEGRAM_ENABLED:false}") enabled: Boolean,
        @Value("\${FORENA_TELEGRAM_WEBHOOK_SECRET:}") secret: String,
    ): SecurityFilterChain =
        http
            .securityMatcher("/api/telegram/webhook")
            .sessionManagement { it.sessionCreationPolicy(SessionCreationPolicy.STATELESS) }
            .securityContext { it.requireExplicitSave(true) }
            .requestCache { it.disable() }
            .csrf { it.disable() }
            .authorizeHttpRequests { it.anyRequest().hasAuthority("telegram-webhook") }
            .oauth2ResourceServer { resource ->
                resource.bearerTokenResolver { request ->
                    request.getHeader("X-Telegram-Bot-Api-Secret-Token")
                }
                resource.opaqueToken { opaque ->
                    opaque.introspector { supplied ->
                        if (
                            !enabled ||
                                !secret.matches(Regex("[A-Za-z0-9_-]{32,256}")) ||
                                !MessageDigest.isEqual(secret.toByteArray(), supplied.toByteArray())
                        )
                            throw BadOpaqueTokenException("Invalid webhook credential")
                        DefaultOAuth2AuthenticatedPrincipal(
                            "telegram-webhook",
                            mapOf("sub" to "telegram-webhook"),
                            listOf(SimpleGrantedAuthority("telegram-webhook")),
                        )
                    }
                }
            }
            .build()
}
