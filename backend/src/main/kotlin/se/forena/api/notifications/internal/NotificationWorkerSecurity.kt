package se.forena.api.notifications.internal

import java.security.MessageDigest
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.annotation.Order
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.core.DefaultOAuth2AuthenticatedPrincipal
import org.springframework.security.oauth2.server.resource.introspection.BadOpaqueTokenException
import org.springframework.security.web.SecurityFilterChain
import se.forena.api.notifications.NotificationSettings

@Configuration(proxyBeanMethods = false)
class NotificationWorkerSecurity {
    @Bean
    @Order(0)
    fun notificationWorkerFilterChain(
        http: HttpSecurity,
        settings: NotificationSettings,
    ): SecurityFilterChain {
        http
            .securityMatcher("/internal/notifications/**")
            .sessionManagement { it.sessionCreationPolicy(SessionCreationPolicy.STATELESS) }
            .securityContext { it.requireExplicitSave(true) }
            .requestCache { it.disable() }
            .csrf { it.disable() }
            .authorizeHttpRequests { it.anyRequest().hasAuthority("notification-worker") }
            .oauth2ResourceServer { resource ->
                resource.opaqueToken { opaque ->
                    opaque.introspector { token ->
                        if (
                            !settings.enabled ||
                                !MessageDigest.isEqual(
                                    token.toByteArray(Charsets.UTF_8),
                                    settings.workerToken.toByteArray(Charsets.UTF_8),
                                )
                        ) {
                            throw BadOpaqueTokenException("Invalid worker credential")
                        }
                        DefaultOAuth2AuthenticatedPrincipal(
                            "notification-worker",
                            mapOf("sub" to "notification-worker"),
                            listOf(SimpleGrantedAuthority("notification-worker")),
                        )
                    }
                }
            }
        return http.build()
    }
}
