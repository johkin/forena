package se.forena.api.administration

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.context.annotation.Configuration
import org.springframework.security.authentication.BadCredentialsException
import org.springframework.security.core.Authentication
import org.springframework.stereotype.Component
import org.springframework.web.servlet.HandlerInterceptor
import org.springframework.web.servlet.config.annotation.InterceptorRegistry
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer
import se.forena.api.identity.BrowserLoginLimiter
import se.forena.api.identity.CurrentActorService

/** Runs after Spring Security and before body parsing or any administration transaction. */
@Component
class AdministrationAdmission(private val limiter: BrowserLoginLimiter, private val actors: CurrentActorService) : HandlerInterceptor {
    override fun preHandle(request: HttpServletRequest, response: HttpServletResponse, handler: Any): Boolean {
        if (request.method in setOf("GET", "HEAD", "OPTIONS")) return true
        val authentication = request.userPrincipal as? Authentication
            ?: throw BadCredentialsException("Inactive session")
        val actor = actors.from(authentication, request)
        limiter.admitAdministration(limiter.client(request), actor.subject)
        return true
    }
}

@Configuration(proxyBeanMethods = false)
class AdministrationWebConfiguration(private val admission: AdministrationAdmission) : WebMvcConfigurer {
    override fun addInterceptors(registry: InterceptorRegistry) {
        registry.addInterceptor(admission).addPathPatterns("/api/admin/**").excludePathPatterns("/api/admin/bootstrap")
    }
}
