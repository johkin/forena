package se.forena.api.identity

import java.nio.charset.StandardCharsets.UTF_8
import java.time.Duration
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.convert.support.GenericConversionService
import org.springframework.session.SaveMode
import org.springframework.session.config.SessionRepositoryCustomizer
import org.springframework.session.jdbc.JdbcIndexedSessionRepository
import org.springframework.session.jdbc.config.annotation.web.http.EnableJdbcHttpSession
import org.springframework.session.web.http.CookieHttpSessionIdResolver
import org.springframework.session.web.http.CookieSerializer
import org.springframework.session.web.http.DefaultCookieSerializer
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate

@Configuration(proxyBeanMethods = false)
@ConditionalOnWebApplication
@EnableJdbcHttpSession(tableName = "forena.spring_session")
class BrowserSessionConfiguration {
    @Bean
    fun httpSessionIdResolver(cookieSerializer: CookieSerializer) = CookieHttpSessionIdResolver().apply {
        setCookieSerializer(cookieSerializer)
    }

    @Bean
    fun cookieSerializer(settings: BrowserSessionSettings): CookieSerializer = ProtectedSessionCookieSerializer(DefaultCookieSerializer().apply {
        setCookieName(settings.cookieName)
        setCookiePath("/")
        setUseSecureCookie(settings.secure)
        setUseHttpOnlyCookie(true)
        setSameSite("Lax")
        setUseBase64Encoding(false)
        setCookieMaxAge(settings.maxSeconds.toInt())
    }, settings)

    @Bean
    fun browserSessionRepositoryCustomizer(settings: BrowserSessionSettings) =
        SessionRepositoryCustomizer<JdbcIndexedSessionRepository> {
            it.setDefaultMaxInactiveInterval(Duration.ofSeconds(settings.idleSeconds))
            it.setSaveMode(SaveMode.ON_SET_ATTRIBUTE)
        }

    // Refresh reads/saves join the transaction holding the shared session row lock.
    @Bean("springSessionTransactionOperations")
    fun sessionTransactions(manager: PlatformTransactionManager): TransactionTemplate = TransactionTemplate(manager)

    // String attributes only: principal ID, account generation and WebAuthn challenge.
    // Avoid Java deserialization and native-image reflection for custom DTOs.
    @Bean("springSessionConversionService")
    fun sessionConversionService() = GenericConversionService().apply {
        addConverter(Any::class.java, ByteArray::class.java) {
            require(it is String) { "Session attributes must be strings" }
            it.toByteArray(UTF_8)
        }
        addConverter(ByteArray::class.java, Any::class.java) { String(it, UTF_8) }
    }
}
