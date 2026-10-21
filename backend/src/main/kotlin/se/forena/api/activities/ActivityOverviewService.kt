package se.forena.api.activities

import java.time.temporal.ChronoUnit
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import se.forena.api.activities.internal.ActivityOverviewRepository
import se.forena.api.identity.Actor
import se.forena.api.identity.DatabaseClockService
import se.forena.api.identity.PersonAccessService
import se.forena.api.identity.SessionService

@Service
class ActivityOverviewService(
    private val sessions: SessionService,
    private val clock: DatabaseClockService,
    private val access: PersonAccessService,
    private val overview: ActivityOverviewRepository
) {
    @Transactional(readOnly = true)
    fun list(actor: Actor, offset: Int): MyActivities {
        if (offset !in 0..100_000) throw InvitationProblem(400, "Ogiltigt sidnummer.")
        sessions.requireActive(actor)
        val people = access.people(actor)
        if (people.isEmpty()) return MyActivities(emptyList(), null)
        val now = clock.now()
        val rows = overview.findUpcoming(people.map { it.id }, now, now.plus(90, ChronoUnit.DAYS), offset)
        return MyActivities(rows.take(50).map {
            MyActivity(it.id, it.title, it.startsAt, it.endsAt, it.organizationName, it.teamName)
        }, if (rows.size > 50 && offset + 50 <= 100_000) offset + 50 else null)
    }
}
