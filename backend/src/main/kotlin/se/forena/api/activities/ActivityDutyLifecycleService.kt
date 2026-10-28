package se.forena.api.activities

import java.time.Instant
import java.util.UUID
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Service

/** Invoked inside the owning activity transaction; completed work remains historical. */
@Service
class ActivityDutyLifecycleService(private val jdbc: JdbcClient) {
    fun follow(activity: UUID, start: Instant, end: Instant, cancelled: Boolean) {
        jdbc
            .sql(
                """update forena.activity_duty set starts_at=:start,ends_at=:end,
            state=case when :cancelled then 'cancelled' else state end,revision=revision+1
            where activity_id=:activity and state<>'completed'"""
            )
            .param("start", java.sql.Timestamp.from(start))
            .param("end", java.sql.Timestamp.from(end))
            .param("cancelled", cancelled)
            .param("activity", activity)
            .update()
    }
}
