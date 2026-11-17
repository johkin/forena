package se.forena.api.activities

import java.time.ZoneId
import java.util.UUID
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import se.forena.api.activities.internal.ManagementRepository
import se.forena.api.activities.internal.RosterRepository
import se.forena.api.identity.*

/** Club account operations use the same roster mandate as member administration. */
@Service
@Transactional
class ClubAccountService(
    private val profiles: AccountProfileService, private val teams: ManagementRepository,
    private val roster: RosterRepository, private val clock: DatabaseClockService,
) {
    private fun context(team: UUID): Pair<UUID, Set<UUID>> {
        val row = teams.team(team) ?: throw NoSuchElementException()
        return row.organizationId to roster.members(team, clock.now().atZone(ZoneId.of(row.timeZone)).toLocalDate()).map { it.id }.toSet()
    }
    @PreAuthorize("@teamAccess.canAdministerRoster(#actor, #team)")
    fun view(actor: Actor, team: UUID): ClubAccountView {
        val (organization, people) = context(team)
        return profiles.clubView(organization, people)
    }
    @PreAuthorize("@teamAccess.canAdministerRoster(#actor, #team)")
    fun history(actor: Actor, team: UUID, person: UUID): List<ProfileHistory> {
        val (organization, people) = context(team)
        require(person in people)
        return profiles.clubHistory(organization, person)
    }
    @PreAuthorize("@teamAccess.canAdministerRoster(#actor, #team)")
    fun correct(actor: Actor, team: UUID, person: UUID, command: BirthDateCorrectionCommand) {
        val (organization, people) = context(team)
        require(person in people)
        profiles.correctBirthDate(actor, organization, person, command)
    }
    @PreAuthorize("@teamAccess.canAdministerRoster(#actor, #team)")
    fun review(actor: Actor, team: UUID, proposal: UUID, approve: Boolean) {
        val (organization, people) = context(team)
        profiles.review(actor, organization, proposal, approve, people)
    }
}
