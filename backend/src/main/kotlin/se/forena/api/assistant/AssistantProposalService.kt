package se.forena.api.assistant

import java.util.UUID
import org.springframework.security.access.AccessDeniedException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import se.forena.api.activities.*
import se.forena.api.assistant.internal.ConversationRepository
import se.forena.api.identity.*
import tools.jackson.databind.json.JsonMapper

@Service
class AssistantProposalService(
    private val conversations: ConversationRepository,
    private val sessions: SessionService,
    private val profiles: AssistantProfileService,
    private val activities: AssistantActivityService,
    private val overview: PersonalOverviewService,
    private val management: ActivityManagementService,
    private val attendance: AttendanceService,
    private val invitations: InvitationService,
    private val duties: ActivityDutyService,
    private val identities: TelegramIdentityService,
    private val clock: DatabaseClockService,
    private val json: JsonMapper,
) {
    @Transactional
    fun preview(
        actor: Actor,
        conversation: Conversation,
        target: AssistantTarget?,
        answer: ModelAnswer,
    ): List<AssistantProposal> {
        sessions.requireActive(actor)
        require(
            listOf(
                    answer.memory,
                    answer.activity,
                    answer.series,
                    answer.reminderActivityId,
                    answer.duty,
                    answer.response,
                    answer.attendance,
                )
                .count { it != null } <= 1
        )
        val locked = conversations.find(actor.subject, conversation.id, true)
        check(locked.active && locked.revision == conversation.revision)
        val draft =
            when {
                answer.memory != null -> "memory" to json.writeValueAsString(answer.memory)
                answer.activity != null -> "activity" to json.writeValueAsString(answer.activity)
                answer.series != null -> "series" to json.writeValueAsString(answer.series)
                answer.reminderActivityId != null ->
                    "reminder" to json.writeValueAsString(ReminderDraft(answer.reminderActivityId))
                answer.duty != null -> "duty" to json.writeValueAsString(answer.duty)
                answer.response != null -> "response" to json.writeValueAsString(answer.response)
                answer.attendance != null ->
                    "attendance" to json.writeValueAsString(answer.attendance)
                else -> return emptyList()
            }
        val (label, fingerprint) = inspect(actor, draft.first, draft.second, target)
        return listOf(
            conversations.propose(locked, draft.first, label, draft.second, fingerprint, target)
        )
    }

    @Transactional
    fun confirm(actor: Actor, id: UUID): ConfirmationResult {
        sessions.requireActive(actor)
        // Read identity without a row lock, then take the stable conversation -> proposal ->
        // activity order.
        val conversationId = conversations.proposalConversation(actor.subject, id)
        val conversation = conversations.find(actor.subject, conversationId, true)
        val proposal = conversations.proposal(actor.subject, id)
        if (
            actor.channel == "telegram" &&
                (conversation.channel != "telegram" ||
                    proposal.kind !in listOf("response", "attendance"))
        )
            throw AccessDeniedException("Web confirmation required")
        if (
            actor.channel == "web" &&
                conversation.channel == "telegram" &&
                proposal.kind in listOf("response", "attendance")
        )
            throw AccessDeniedException("Telegram confirmation required")
        check(
            conversation.active && proposal.expiresAt > clock.now() && proposal.state != "invalid"
        )
        if (proposal.state == "completed")
            return ConfirmationResult(true, "Förslaget är redan genomfört.")
        if (proposal.kind == "duty") {
            json
                .readValue(proposal.payload, ActivityDutyCommand::class.java)
                .activityIds
                .sorted()
                .forEach { activities.lockActivity(actor, it) }
        }
        affectedActivity(actor, proposal)?.let { activities.lockActivity(actor, it) }
        val target = proposal.organizationId?.let { AssistantTarget(it, proposal.teamId) }
        val (label, currentFingerprint) = inspect(actor, proposal.kind, proposal.payload, target)
        if (proposal.fingerprint != currentFingerprint) {
            // Invalidate this proposal only. Other independent previews remain reviewable.
            conversations.invalidateProposal(actor.subject, proposal.id)
            val refreshed =
                conversations.propose(
                    conversation,
                    proposal.kind,
                    label,
                    proposal.payload,
                    currentFingerprint,
                    target,
                )
            return ConfirmationResult(
                false,
                "Underlaget har ändrats. Granska det uppdaterade förslaget och bekräfta igen.",
                refreshed,
            )
        }
        when (proposal.kind) {
            "memory" ->
                profiles.remember(actor, json.readValue(proposal.payload, MemoryDraft::class.java))
            "activity" ->
                management.create(
                    actor,
                    json.readValue(proposal.payload, ActivityCommand::class.java),
                )
            "series" ->
                management.createSeries(
                    actor,
                    json.readValue(proposal.payload, ActivitySeriesCommand::class.java),
                )
            "reminder" ->
                activities.queueReminder(
                    actor,
                    json.readValue(proposal.payload, ReminderDraft::class.java).activityId,
                )
            "duty" ->
                duties.save(
                    actor,
                    json.readValue(proposal.payload, ActivityDutyCommand::class.java),
                )
            "response" -> {
                val draft = json.readValue(proposal.payload, ResponseDraft::class.java)
                val rows = responseRows(actor, draft)
                activities.respond(
                    actor,
                    draft.invitationIds.map {
                        it to ResponseChange(draft.response, draft.commentProvided, draft.comment)
                    },
                    rows.associate { it.id to it.revision },
                    invitations,
                )
            }
            "attendance" -> {
                val draft = json.readValue(proposal.payload, AttendanceDraft::class.java)
                attendance.patch(
                    actor,
                    draft.activityId,
                    attendance.snapshot(actor, draft.activityId).revision,
                    draft.changes.associate { it.personId to it.present },
                )
            }
            else -> throw IllegalArgumentException()
        }
        conversations.finish(actor.subject, id)
        return ConfirmationResult(
            true,
            if (proposal.kind == "reminder") "Påminnelsen är köad för leverans."
            else "Ändringen är sparad.",
        )
    }

    private fun affectedActivity(actor: Actor, proposal: AssistantProposal): UUID? =
        when (proposal.kind) {
            "attendance" -> json.readValue(proposal.payload, AttendanceDraft::class.java).activityId
            "reminder" -> json.readValue(proposal.payload, ReminderDraft::class.java).activityId
            "response" -> {
                val ids = json.readValue(proposal.payload, ResponseDraft::class.java).invitationIds
                overview
                    .overview(actor)
                    .activities
                    .single { a -> a.people.any { it.invitation?.id in ids } }
                    .id
            }
            else -> null
        }

    private fun inspect(
        actor: Actor,
        kind: String,
        payload: String,
        target: AssistantTarget?,
    ): Pair<String, String> {
        fun hash(value: Any) = identities.fingerprint(json.writeValueAsString(value))
        fun activity(id: UUID): PersonalActivity {
            val activity = activities.activity(actor, id)
            if (target != null)
                require(
                    activity.organization.id == target.organizationId &&
                        (target.teamId == null || activity.team.id == target.teamId)
                )
            return activity
        }
        return when (kind) {
            "memory" -> {
                val draft = json.readValue(payload, MemoryDraft::class.java)
                profiles.validateMemory(actor, draft)
                if (draft.scope != "personal")
                    require(
                        target != null &&
                            draft.organizationId == target.organizationId &&
                            (draft.teamId == null || draft.teamId == target.teamId)
                    )
                val workspace =
                    draft.organizationId?.let { org ->
                        overview.overview(actor).organizations.single { it.id == org }.name
                    } ?: "Personligt"
                "Spara minne · $workspace · ${draft.scope}\n${draft.content}" to hash(draft)
            }
            "activity" -> {
                val draft = json.readValue(payload, ActivityCommand::class.java)
                require(target != null && draft.teamId == target.teamId)
                val context = management.context(actor, requireNotNull(draft.teamId))
                require(context.team.organizationId == target.organizationId)
                ActivityTimes.validate(
                    draft,
                    java.time.ZoneId.of(context.team.timeZone),
                    creating = true,
                )
                "Skapa aktivitet · ${context.team.organizationName} · ${context.team.name}\n${draft.title}\n${draft.startsAt} – ${draft.endsAt}\n${draft.location}\n${draft.description}\nKallelser: ${draft.invitationMode}; personer: ${context.members.filter { it.id in draft.personIds }.joinToString { it.displayName }}" to
                    hash(context)
            }
            "series" -> {
                val draft = json.readValue(payload, ActivitySeriesCommand::class.java)
                require(target != null && draft.teamId == target.teamId)
                val context = management.context(actor, draft.teamId)
                require(
                    context.team.organizationId == target.organizationId &&
                        draft.timeZone == context.team.timeZone
                )
                val occurrences = ActivityTimes.weekly(draft, java.time.ZoneId.of(draft.timeZone))
                "Skapa serie · ${context.team.organizationName} · ${context.team.name}\n${draft.title}\n${draft.startsOn} – ${draft.endsOn}, ${draft.startTime} (${draft.timeZone})\n${occurrences.size} tillfällen; veckodagar ${draft.weekdays.joinToString()}\nKallelser: ${draft.invitationMode}" to
                    hash(context)
            }
            "reminder" -> {
                val draft = json.readValue(payload, ReminderDraft::class.java)
                val row = activity(draft.activityId)
                if (!management.canManageInvitations(actor, row.team.id))
                    throw AccessDeniedException("Invitation permission required")
                val recipients =
                    activities.invitations(actor, row.id).filter { it.response == "pending" }
                check(recipients.isNotEmpty())
                "Skicka påminnelse · ${row.organization.name} · ${row.team.name}\n${row.title}\n${recipients.joinToString { it.name }}" to
                    hash(listOf(row, recipients))
            }
            "duty" -> {
                val command = json.readValue(payload, ActivityDutyCommand::class.java)
                require(target != null && target.teamId == command.teamId)
                val rows = duties.preview(actor, command)
                val context = activities.team(actor, command.teamId)
                require(context.organizationId == target.organizationId)
                "Spara uppgifter · ${context.organizationName} · ${context.teamName}\n${command.name}, ${command.places} platser\n${command.instructions}\n" +
                    rows.joinToString("\n") {
                        "${it.title} · ${it.startsAt} – ${it.endsAt}${if (it.exists) " (finns redan, hoppas över)" else ""}"
                    } to hash(rows)
            }
            "response" -> {
                val draft = json.readValue(payload, ResponseDraft::class.java)
                require(
                    draft.response in listOf("accepted", "declined") &&
                        draft.invitationIds.isNotEmpty() &&
                        draft.invitationIds.distinct().size == draft.invitationIds.size
                )
                require(draft.comment == null || draft.comment.length <= 500)
                val rows = responseRows(actor, draft)
                val selected =
                    overview.overview(actor).activities.filter { a ->
                        a.people.any { it.invitation?.id in draft.invitationIds }
                    }
                require(selected.size == 1)
                val row = activity(selected.single().id)
                "Bekräfta svar · ${row.organization.name} · ${row.team.name}\n${row.title}\n" +
                    rows.joinToString("\n") {
                        "${it.name}: ${responseLabel(it.response)} → ${responseLabel(draft.response)}; kommentar: ${if (draft.commentProvided) draft.comment.orEmpty() else it.responseComment.orEmpty()}"
                    } to hash(listOf(row, rows))
            }
            "attendance" -> {
                val draft = json.readValue(payload, AttendanceDraft::class.java)
                val row = activity(draft.activityId)
                val state = attendance.snapshot(actor, draft.activityId)
                check(state.writable)
                require(
                    draft.changes.isNotEmpty() &&
                        draft.changes.distinctBy { it.personId }.size == draft.changes.size
                )
                val byId = state.roster.associateBy { it.personId }
                require(draft.changes.all { it.personId in byId })
                "Registrera närvaro · ${row.organization.name} · ${row.team.name}\n${row.title}\n" +
                    draft.changes.joinToString("\n") { change ->
                        val before = byId.getValue(change.personId)
                        "${before.displayName}: ${presence(before.present)} → ${presence(change.present)}"
                    } to hash(listOf(row, state.revision, state.roster))
            }
            else -> throw IllegalArgumentException()
        }
    }

    private fun responseLabel(value: String) =
        when (value) {
            "accepted" -> "Kommer"
            "declined" -> "Kan inte"
            else -> "Obesvarad"
        }

    private fun presence(value: Boolean?) =
        when (value) {
            true -> "närvarande"
            false -> "frånvarande"
            null -> "okänt"
        }

    private fun responseRows(actor: Actor, draft: ResponseDraft): List<AssistantInvitation> {
        val overview = overview.overview(actor)
        val ids = draft.invitationIds.toSet()
        val selected = overview.activities.filter { a -> a.people.any { it.invitation?.id in ids } }
        val allowed =
            selected.flatMap { a -> activities.invitations(actor, a.id) }.filter { it.id in ids }
        require(allowed.map { it.id }.toSet() == ids)
        return allowed
    }
}
