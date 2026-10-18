package se.forena.probe

import jakarta.servlet.DispatcherType
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter
import org.springframework.web.filter.OncePerRequestFilter
import java.security.MessageDigest

@Configuration
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
class ProbeSecurity(
    @Value("\${probe.token}") private val token: String,
    @Value("\${probe.worker.token:}") private val workerToken: String
) {
    init {
        require(token.length >= 32) { "PROBE_TOKEN must contain at least 32 characters" }
        require(workerToken.isEmpty() || workerToken.length >= 32) { "Worker token must contain at least 32 characters" }
        require(workerToken != token) { "Use a separate worker token" }
    }

    @Bean
    fun security(http: HttpSecurity): SecurityFilterChain = http
        .csrf { it.disable() }
        .sessionManagement { it.sessionCreationPolicy(SessionCreationPolicy.STATELESS) }
        .authorizeHttpRequests {
            it.dispatcherTypeMatchers(DispatcherType.ERROR, DispatcherType.FORWARD).permitAll()
                .requestMatchers("/", "/index.html", "/probe.js", "/actuator/health").permitAll()
                .requestMatchers("/api/probes/worker").hasRole("WORKER")
                .anyRequest().hasRole("PROBE")
        }
        .exceptionHandling { it.authenticationEntryPoint { _, response, _ -> response.sendError(401) } }
        .addFilterBefore(object : OncePerRequestFilter() {
            override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain) {
                val supplied = request.getHeader("Authorization")?.takeIf { it.startsWith("Bearer ") }?.removePrefix("Bearer ")
                if (supplied != null && MessageDigest.isEqual(token.toByteArray(), supplied.toByteArray())) {
                    SecurityContextHolder.getContext().authentication = UsernamePasswordAuthenticationToken(
                        "isolated-probe", null, listOf(SimpleGrantedAuthority("ROLE_PROBE")))
                } else if (supplied != null && workerToken.isNotEmpty() &&
                    MessageDigest.isEqual(workerToken.toByteArray(), supplied.toByteArray())) {
                    SecurityContextHolder.getContext().authentication = UsernamePasswordAuthenticationToken(
                        "isolated-worker", null, listOf(SimpleGrantedAuthority("ROLE_WORKER")))
                }
                chain.doFilter(request, response)
            }
        }, UsernamePasswordAuthenticationFilter::class.java)
        .build()
}
