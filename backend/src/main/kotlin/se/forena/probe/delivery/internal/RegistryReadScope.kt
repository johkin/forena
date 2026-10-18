package se.forena.probe.delivery.internal

import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Primary
import org.springframework.modulith.events.core.EventPublicationRepository
import org.springframework.modulith.events.EventPublication.Status
import java.time.Instant
import java.util.UUID
import org.springframework.modulith.events.core.TargetEventPublication

/** Synchronous repository read scope only; never inherited by asynchronous listener threads. */
internal object RegistryReadScope {
    private val current = ThreadLocal<List<TargetEventPublication>>()

    fun publications(): List<TargetEventPublication>? = current.get()

    fun <T> withPublication(publications: List<TargetEventPublication>, action: () -> T): T {
        check(current.get() == null) { "Nested registry read scope" }
        require(publications.size <= 1)
        current.set(publications)
        return try { action() } finally { current.remove() }
    }
}

/** Public SPI decorator: every write still executes the original, transaction-advised JDBC repository. */
internal class ScopedPublicationRepository(private val delegate: EventPublicationRepository) :
    EventPublicationRepository by delegate {
    // Kotlin delegation does not forward inherited Java default methods. Forward these explicitly:
    // their interface defaults include no-ops, which would silently lose delivery state transitions.
    override fun markProcessing(id: UUID) = delegate.markProcessing(id)
    override fun markFailed(id: UUID) = delegate.markFailed(id)
    override fun markResubmitted(id: UUID, date: Instant) = delegate.markResubmitted(id, date)
    override fun markCompleted(publication: TargetEventPublication, date: Instant) =
        delegate.markCompleted(publication, date)
    override fun findCompletedPublications() = delegate.findCompletedPublications()
    override fun findFailedPublications(criteria: EventPublicationRepository.FailedCriteria) =
        delegate.findFailedPublications(criteria)
    override fun findByStatus(status: Status) = delegate.findByStatus(status)
    override fun countByStatus(status: Status) = delegate.countByStatus(status)

    override fun findIncompletePublications(): List<TargetEventPublication> =
        RegistryReadScope.publications() ?: delegate.findIncompletePublications()
}

@Configuration(proxyBeanMethods = false)
internal class RegistryConfiguration {
    @Bean
    @Primary
    fun workerPublicationRepository(
        @Qualifier("jdbcEventPublicationRepository") delegate: EventPublicationRepository
    ): EventPublicationRepository = ScopedPublicationRepository(delegate)
}
