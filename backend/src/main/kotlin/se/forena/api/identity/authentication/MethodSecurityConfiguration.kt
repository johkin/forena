package se.forena.api.identity.authentication

import org.springframework.context.annotation.Configuration
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity

@Configuration(proxyBeanMethods = false) @EnableMethodSecurity class MethodSecurityConfiguration
