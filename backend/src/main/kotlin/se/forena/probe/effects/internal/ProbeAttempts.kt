package se.forena.probe.effects.internal

import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Component
class ProbeAttempts(private val jdbc: JdbcClient) {
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    fun record(id: UUID, instanceId: String) {
        jdbc.sql("insert into probe_attempt(run_id,instance_id) values (:id,:instance)")
            .param("id", id).param("instance", instanceId).update()
    }
}
