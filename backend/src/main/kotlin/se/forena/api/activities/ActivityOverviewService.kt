package se.forena.api.activities

import java.time.temporal.ChronoUnit
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import se.forena.api.activities.internal.ActivityOverviewRepository
import se.forena.api.activities.internal.InvitationRepository
import se.forena.api.identity.Actor
import se.forena.api.identity.DatabaseClockService
import se.forena.api.identity.PersonAccessService
import se.forena.api.identity.SessionService

@Service
class ActivityOverviewService(
    private val sessions: SessionService,
    private val clock: DatabaseClockService,
    private val access: PersonAccessService,
    private val overview: ActivityOverviewRepository,
    private val invitations: InvitationRepository
) {
    @Transactional(readOnly = true)
    fun list(actor: Actor, offset: Int): MyActivities {
        if (offset !in 0..100_000) throw IllegalArgumentException("Ogiltigt sidnummer.")
        sessions.requireActive(actor)
        val people = access.people(actor)
        if (people.isEmpty()) return MyActivities(emptyList(), null)
        val now = clock.now()
        val rows = overview.findUpcoming(people.map { it.id }, now, now.plus(90, ChronoUnit.DAYS), offset)
        val page = rows.take(50)
        val byActivity = if (page.isEmpty()) emptyMap() else
            invitations.findSentForActivities(page.map { it.id }, people.map { it.id }, now).groupBy { it.activityId }
        return MyActivities(page.map { activity ->
            val byPerson = byActivity[activity.id].orEmpty().associateBy { it.personId }
            val accessible = people.mapNotNull { person -> byPerson[person.id]?.let { invitation ->
                AccessibleInvitation(invitation.id, person.id, InvitationResponse.fromDatabase(invitation.response),
                    invitation.responseComment, person.name)
            } }
            MyActivity(activity.id, activity.title, activity.startsAt, activity.endsAt,
                activity.organizationName, activity.teamName, accessible)
        }, if (rows.size > 50 && offset + 50 <= 100_000) offset + 50 else null)
    }
}
