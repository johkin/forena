package se.forena.api.notifications.internal

import java.time.Instant
import java.util.UUID
import javax.sql.DataSource
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Primary
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.modulith.events.EventPublication.Status
import org.springframework.modulith.events.IncompleteEventPublications
import org.springframework.modulith.events.core.EventPublicationRepository
import org.springframework.modulith.events.core.EventSerializer
import org.springframework.modulith.events.core.PublicationTargetIdentifier
import org.springframework.modulith.events.core.TargetEventPublication
import org.springframework.stereotype.Service
import se.forena.api.activities.InvitationNotificationRequested

/**
 * Read-only bounded projection of the pinned Modulith v2 schema; every transition stays in
 * Modulith.
 */
class BoundedPublicationRepository(
    private val delegate: EventPublicationRepository,
    dataSource: DataSource,
    private val serializer: EventSerializer,
) : EventPublicationRepository by delegate {
    private val jdbc = JdbcTemplate(dataSource).apply { queryTimeout = 2 }

    override fun findIncompletePublications(): List<TargetEventPublication> = read(Instant.MAX)

    override fun findIncompletePublicationsPublishedBefore(
        instant: Instant
    ): List<TargetEventPublication> = read(instant)

    private fun read(before: Instant): List<TargetEventPublication> {
        // PostgreSQL cannot represent Instant.MAX. No cutoff is needed for the bounded shutdown
        // sample.
        val cutoff =
            if (before == Instant.MAX) ""
            else "and greatest(publication_date, last_resubmission_date) < ?"
        val sql =
            """
            select * from forena.event_publication
            where completion_date is null
              and event_type = 'se.forena.api.activities.InvitationNotificationRequested'
              and listener_id = 'invitation-email-v1'
              $cutoff
            order by greatest(publication_date, last_resubmission_date), id
            limit 20
        """
        val arguments =
            if (before == Instant.MAX) emptyArray() else arrayOf(java.sql.Timestamp.from(before))
        return jdbc.query(
            sql,
            { row, _ ->
                val id = row.getObject("id", UUID::class.java)
                val event =
                    serializer.deserialize(
                        row.getString("serialized_event"),
                        InvitationNotificationRequested::class.java,
                    )
                val base =
                    TargetEventPublication.of(
                        event,
                        PublicationTargetIdentifier.of(row.getString("listener_id")),
                        row.getTimestamp("publication_date").toInstant(),
                    )
                val status = Status.valueOf(row.getString("status"))
                val last = row.getTimestamp("last_resubmission_date")?.toInstant()
                val attempts = row.getInt("completion_attempts")
                object : TargetEventPublication by base {
                    override fun getIdentifier(): UUID = id

                    override fun getStatus(): Status =
                        if (base.isCompleted) Status.COMPLETED else status

                    override fun getLastResubmissionDate(): Instant? = last

                    override fun getCompletionAttempts(): Int = attempts
                }
            },
            *arguments,
        )
    }

    // Forward Java default methods explicitly: their defaults include no-op state transitions.
    override fun markProcessing(id: UUID) = delegate.markProcessing(id)

    override fun markFailed(id: UUID) = delegate.markFailed(id)

    override fun markResubmitted(id: UUID, date: Instant): Boolean =
        delegate.markResubmitted(id, date)

    override fun markCompleted(publication: TargetEventPublication, date: Instant) =
        delegate.markCompleted(publication, date)

    override fun findCompletedPublications(): List<TargetEventPublication> =
        delegate.findCompletedPublications()

    override fun findFailedPublications(
        criteria: EventPublicationRepository.FailedCriteria
    ): List<TargetEventPublication> = delegate.findFailedPublications(criteria)

    override fun findByStatus(status: Status): List<TargetEventPublication> =
        delegate.findByStatus(status)

    override fun countByStatus(status: Status): Int = delegate.countByStatus(status)
}

@Configuration(proxyBeanMethods = false)
class PublicationRecoveryConfiguration {
    @Bean
    @Primary
    fun boundedPublicationRepository(
        @Qualifier("jdbcEventPublicationRepository") delegate: EventPublicationRepository,
        dataSource: DataSource,
        serializer: EventSerializer,
    ): EventPublicationRepository = BoundedPublicationRepository(delegate, dataSource, serializer)
}

@Service
class PublicationRecovery(
    private val repository: EventPublicationRepository,
    private val publications: IncompleteEventPublications,
) {
    fun recover(deadline: Long): Int {
        val cutoff = Instant.now().minusSeconds(120)
        val stale = repository.findIncompletePublicationsPublishedBefore(cutoff)
        if (stale.isEmpty()) return 0
        // A dead JVM can leave PROCESSING/RESUBMITTED. Module handover is a unique INSERT,
        // so concurrent recovery is harmless even if a slow original transaction later returns.
        for (publication in stale) repository.markFailed(publication.identifier)
        val ids = stale.map { it.identifier }.toSet()
        publications.resubmitIncompletePublications {
            it.identifier in ids &&
                !Thread.currentThread().isInterrupted &&
                System.nanoTime() < deadline
        }
        return stale.size
    }
}
