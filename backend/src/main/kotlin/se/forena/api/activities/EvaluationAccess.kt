package se.forena.api.activities

import java.time.ZoneId
import java.util.UUID
import org.springframework.security.access.AccessDeniedException
import org.springframework.stereotype.Service
import se.forena.api.activities.internal.*
import se.forena.api.administration.AdministrationService
import se.forena.api.identity.Actor
import se.forena.api.identity.DatabaseClockService
import se.forena.api.identity.SessionService

/** Public facts for capabilities; no extension reads activity or identity storage directly. */
@Service
class EvaluationAccess(
    private val sessions: SessionService,
    private val administration: AdministrationService,
    private val teams: ManagementRepository,
    private val leaders: FollowUpActivityRepository,
    private val players: DisciplineObjectRepository,
    private val clock: DatabaseClockService,
) {
    fun administrator(actor: Actor, team: UUID): Boolean {
        sessions.requireActive(actor)
        return administration.canAdministerTeam(actor, team)
    }

    fun authorize(actor: Actor, team: UUID, configuring: Boolean = false) {
        sessions.requireActive(actor)
        teams.team(team) ?: throw NoSuchElementException()
        if (!administrator(actor, team) && (configuring || !leaders.leader(actor.subject, team, clock.now())))
            throw AccessDeniedException("Team leader or administrator required")
    }

    fun lock(actor: Actor, team: UUID, configuring: Boolean = false) {
        authorize(actor, team, configuring)
        check(teams.lockTeam(team) != null)
        authorize(actor, team, configuring)
    }

    fun facts(actor: Actor, team: UUID, activityId: UUID?): EvaluationFacts {
        authorize(actor, team)
        val row = teams.team(team) ?: throw NoSuchElementException()
        val today = clock.now().atZone(ZoneId.of(row.timeZone)).toLocalDate()
        val roster = teams.participants(team, today).filter { it.role == "participant" }
            .map { DisciplinePlayer(it.id, it.displayName) }.distinctBy { it.id }
        if (activityId == null) return EvaluationFacts(roster, roster)
        val activity = leaders.activity(activityId)?.takeIf {
            it.teamId == team && it.deletedAt == null && it.status != "cancelled"
        } ?: throw NoSuchElementException()
        require(activity.category == "session")
        val date = activity.startsAt.atZone(ZoneId.of(row.timeZone)).toLocalDate()
        val invited = players.players(activityId, team, date)
        return EvaluationFacts((roster + invited).distinctBy { it.id }, players.acceptedPlayers(activityId, team, date))
    }
}

data class EvaluationFacts(val eligible: List<DisciplinePlayer>, val selected: List<DisciplinePlayer>)
