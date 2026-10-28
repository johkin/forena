package se.forena.api.notifications.internal

import java.time.Instant
import java.util.UUID
import org.springframework.data.jdbc.repository.query.Modifying
import org.springframework.data.jdbc.repository.query.Query
import org.springframework.data.repository.Repository
import se.forena.api.notifications.NotificationStatus

interface InvitationEmailRepository : Repository<InvitationEmailEntity, UUID> {
    @Modifying
    @Query(
        "update forena.notification_worker_state set started_at = clock_timestamp() where id = 1"
    )
    fun started()

    @Modifying
    @Query(
        "update forena.notification_worker_state set completed_at = clock_timestamp() where id = 1"
    )
    fun completed()

    @Query(
        """
        select
          (select count(*) from forena.activity_schedule where state = 'pending') as pending_schedules,
          (select count(*) from forena.activity_schedule where state = 'failed') as failed_schedules,
          (select count(*) from forena.invitation_email where state = 'pending') as pending_emails,
          (select count(*) from forena.invitation_email where state = 'failed') as failed_emails,
          (select count(*) from forena.invitation_email where state = 'uncertain') as uncertain_emails,
          (select count(*) from forena.invitation_email where state = 'suppressed') as suppressed_emails,
          (select count(*) from forena.event_publication where completion_date is null) as incomplete_publications,
          (select greatest(0, extract(epoch from clock_timestamp() - min(n.decided_at)))::bigint
           from forena.invitation_email e join forena.invitation_notification n on n.id = e.id
           where e.state = 'pending') as oldest_email_seconds,
          s.started_at, s.completed_at
        from forena.notification_worker_state s where s.id = 1
    """
    )
    fun status(): NotificationStatus

    @Modifying
    @Query(
        """
        insert into forena.invitation_email(id,recipient,subject,body)
        values (:id,:recipient,:subject,:body) on conflict (id) do nothing
    """
    )
    fun enqueue(id: UUID, recipient: String, subject: String, body: String)

    @Query(
        """
        select * from forena.invitation_email
        where state = 'pending' and next_attempt <= :now
        order by next_attempt, id limit 1 for update skip locked
    """
    )
    fun lockDue(now: Instant): InvitationEmailEntity?

    @Modifying
    @Query("update forena.invitation_email set delivered_via=:channel where id=:id")
    fun deliveryChannel(id: UUID, channel: String)

    fun save(entity: InvitationEmailEntity): InvitationEmailEntity

    @Modifying
    @Query(
        """
        update forena.invitation_email
        set state = :state, next_attempt = :next, provider_message_id = :provider,
            accepted_at = :accepted, last_error = :error
        where id = :id and state = 'pending' and attempts = :attempt
    """
    )
    fun conclude(
        id: UUID,
        attempt: Int,
        state: String,
        next: Instant,
        provider: String?,
        accepted: Instant?,
        error: String?,
    )
}
