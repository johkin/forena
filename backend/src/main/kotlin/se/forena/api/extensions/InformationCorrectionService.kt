package se.forena.api.extensions

import java.util.UUID
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import se.forena.api.activities.AttendanceService
import se.forena.api.activities.DisciplinePlayer
import se.forena.api.activities.FollowUpAccess
import se.forena.api.identity.Actor

/** Activity lock first; both public commands and their audits share this transaction. */
@Service
class InformationCorrectionService(
    private val access: FollowUpAccess,
    private val attendance: AttendanceService,
    private val information: InformationService,
) {
    @Transactional
    fun save(actor: Actor, id: UUID, command: InformationCommand): InformationSnapshot {
        val facts = access.facts(actor, id, lock = true)
        val correction = command.attendance
        if (correction == null) information.save(actor, id, command.answers)
        else if (facts.attendanceRevision == 0L) {
            attendance.save(actor, id, correction)
            information.save(actor, id, command.answers)
        } else {
            val snapshot = attendance.snapshot(actor, id)
            check(snapshot.revision == correction.revision)
            val present = correction.personIds.toSet()
            val players =
                (snapshot.roster + snapshot.candidates)
                    .filter { it.role == "participant" && it.personId in present }
                    .map { DisciplinePlayer(it.personId, it.displayName) }
                    .distinctBy { it.id }
            information.save(actor, id, command.answers, proposedPlayers = players)
            attendance.save(actor, id, correction)
        }
        return information.snapshot(actor, id)
    }
}
