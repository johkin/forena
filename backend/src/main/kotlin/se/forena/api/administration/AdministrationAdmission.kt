package se.forena.api.administration

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import java.util.UUID
import org.springframework.context.annotation.Configuration
import org.springframework.security.access.AccessDeniedException
import org.springframework.security.authentication.BadCredentialsException
import org.springframework.security.core.Authentication
import org.springframework.stereotype.Component
import org.springframework.web.method.HandlerMethod
import org.springframework.web.servlet.HandlerInterceptor
import org.springframework.web.servlet.HandlerMapping
import org.springframework.web.servlet.config.annotation.InterceptorRegistry
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer
import se.forena.api.identity.BrowserLoginLimiter
import se.forena.api.identity.CurrentActorService

/** Runs after Spring Security and before body parsing or administrative writes. */
@Component
class AdministrationAdmission(private val limiter: BrowserLoginLimiter, private val actors: CurrentActorService,
                              private val service: AdministrationService) : HandlerInterceptor {
    override fun preHandle(request: HttpServletRequest, response: HttpServletResponse, handler: Any): Boolean {
        if (request.method in setOf("GET", "HEAD", "OPTIONS")) return true
        val authentication = request.userPrincipal as? Authentication
            ?: throw BadCredentialsException("Inactive session")
        val actor = actors.from(authentication, request)
        val method = handler as? HandlerMethod ?: throw AccessDeniedException("Unknown administration command")
        val variables = request.getAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE) as? Map<*, *>
        fun id(name: String) = UUID.fromString(variables?.get(name) as? String ?: throw IllegalArgumentException("Missing resource"))
        val authority = when (method.method.name) {
            "platform", "createClub", "clubAdmin" -> AdministrationAuthority.Platform
            "updateClub", "createSection", "updateSection" -> AdministrationAuthority.Club(id("clubId"))
            "deleteSection", "sectionAdmin" -> AdministrationAuthority.SectionClub(id("sectionId"))
            "createTeam" -> AdministrationAuthority.Section(id("sectionId"))
            "updateTeam", "deleteTeam" -> AdministrationAuthority.Team(id("teamId"))
            "teamAdmin" -> AdministrationAuthority.TeamBusiness(id("teamId"))
            else -> throw AccessDeniedException("Unknown administration command")
        }
        // Read-only preflight cannot drain shared budgets; mutation rechecks before and after locking.
        service.authorizeMutation(actor, authority)
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
