package se.forena.api.activities

import java.time.Instant
import java.util.UUID
import org.springframework.security.access.AccessDeniedException
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import se.forena.api.activities.internal.ActivityDutyRepository
import se.forena.api.activities.internal.ManagedActivityRepository
import se.forena.api.identity.Actor
import se.forena.api.identity.SessionService

@Service
class ActivityDutyService(
    private val repository: ActivityDutyRepository,
    private val management: ActivityManagementService,
    private val activities: ManagedActivityRepository,
    private val sessions: SessionService,
) {
    @Transactional(readOnly = true)
    @PreAuthorize("@teamAccess.canManageInvitations(#actor, #team)")
    fun targets(actor: Actor, team: UUID): DutyTargets {
        authorize(actor, team)
        val rows = rows(team, "")
        return DutyTargets(rows.take(200), rows.size > 200)
    }

    @Transactional(readOnly = true)
    @PreAuthorize("@teamAccess.canManageInvitations(#actor, #command.teamId)")
    fun preview(actor: Actor, command: ActivityDutyCommand): List<DutyTarget> {
        authorize(actor, command.teamId)
        require(
            command.activityIds.size in 1..100 &&
                command.activityIds.distinct().size == command.activityIds.size
        )
        require(
            command.name.trim().length in 1..80 &&
                command.instructions.length <= 2000 &&
                command.places in 1..50
        )
        val selected =
            command.activityIds.map { id ->
                activities.findById(id).orElseThrow { NoSuchElementException() }
            }
        require(
            selected.all {
                it.teamId == command.teamId &&
                    it.deletedAt == null &&
                    it.status == "scheduled" &&
                    it.startsAt > Instant.now()
            }
        )
        return selected.map { activity ->
            repository.findTarget(command.name.trim(), activity.activityId)
        }
    }

    @Transactional
    @PreAuthorize("@teamAccess.canManageInvitations(#actor, #command.teamId)")
    fun save(actor: Actor, command: ActivityDutyCommand) {
        preview(actor, command)
        command.activityIds.sorted().forEach {
            check(activities.findLockedByActivityId(it) != null)
        }
        val rows = preview(actor, command)
        rows
            .filter { !it.exists }
            .forEach { activity ->
                val id = UUID.randomUUID()
                val organization =
                    activities
                        .findById(activity.id)
                        .orElseThrow { NoSuchElementException() }
                        .organizationId
                repository.insertDuty(
                    id,
                    activity.id,
                    organization,
                    command.name.trim(),
                    command.instructions,
                    activity.startsAt,
                    activity.endsAt,
                    actor.subject,
                )
                for (number in 1..command.places) repository.insertPlace(
                    UUID.randomUUID(),
                    id,
                    number,
                )
                repository.auditCreation(id, actor.subject)
            }
    }

    private fun authorize(actor: Actor, team: UUID) {
        sessions.requireActive(actor)
        if (!management.canManageInvitations(actor, team))
            throw AccessDeniedException("Duty permission required")
    }

    private fun rows(team: UUID, name: String): List<DutyTarget> =
        repository.findTargets(team, name)
}
