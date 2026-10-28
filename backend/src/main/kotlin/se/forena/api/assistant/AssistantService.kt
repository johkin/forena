package se.forena.api.assistant

import java.util.UUID
import java.util.concurrent.CompletableFuture
import java.util.concurrent.Executors
import java.util.function.Consumer
import org.springframework.security.access.AccessDeniedException
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import se.forena.api.activities.*
import se.forena.api.assistant.internal.ConversationRepository
import se.forena.api.identity.*
import tools.jackson.databind.json.JsonMapper

/**
 * Shared orchestration for the web and Telegram. No browser or provider credentials enter prompts.
 */
@Service
class AssistantService(
    private val conversations: ConversationRepository,
    private val sessions: SessionService,
    private val profiles: AssistantProfileService,
    private val overview: PersonalOverviewService,
    private val activityData: AssistantActivityService,
    private val attendance: AttendanceService,
    private val duties: ActivityDutyService,
    private val members: AssistantMemberService,
    private val documents: AssistantDocumentService,
    private val proposals: AssistantProposalService,
    private val model: AssistantModel,
    private val transactions: TransactionTemplate,
    private val json: JsonMapper,
    private val identities: AssistantIdentityService,
) {
    fun list(actor: Actor): List<Conversation> {
        sessions.requireActive(actor)
        return conversations.list(actor.subject)
    }

    fun view(actor: Actor, id: UUID): ConversationView {
        sessions.requireActive(actor)
        val conversation = conversations.find(actor.subject, id)
        return ConversationView(
            conversation,
            conversations.messages(id),
            conversations.proposals(actor.subject, id),
        )
    }

    fun new(actor: Actor, command: ConversationCommand = ConversationCommand()): Conversation =
        requireNotNull(
            transactions.execute {
                sessions.requireActive(actor)
                command.organizationId?.let { profiles.requireOrganization(actor, it) }
                command.teamId?.let { id ->
                    require(activityData.team(actor, id).organizationId == command.organizationId)
                }
                conversations.new(
                    actor.subject,
                    actor.channel,
                    command.organizationId,
                    command.teamId,
                )
            }
        )

    fun resume(actor: Actor, id: UUID): Conversation =
        requireNotNull(
            transactions.execute {
                sessions.requireActive(actor)
                val selected = conversations.find(actor.subject, id)
                require(selected.channel == "web" && actor.channel == "web")
                selected.organizationId?.let { profiles.requireOrganization(actor, it) }
                conversations.resume(actor.subject, id)
            }
        )

    fun activeTelegram(actor: Actor): Conversation =
        requireNotNull(
            transactions.execute {
                sessions.requireActive(actor)
                conversations.active(actor.subject, "telegram", null)
                    ?: conversations.new(actor.subject, "telegram", null, null)
            }
        )

    fun delete(actor: Actor, id: UUID) = transactions.executeWithoutResult {
        sessions.requireActive(actor)
        conversations.delete(actor.subject, id)
    }

    fun send(actor: Actor, id: UUID, command: MessageCommand, emit: Consumer<AssistantReply>) {
        require(command.text.trim().length in 1..4000)
        val conversation =
            requireNotNull(
                transactions.execute {
                    sessions.requireActive(actor)
                    conversations.lockAccount(actor.subject)
                    val current = conversations.find(actor.subject, id, true)
                    require(current.channel == actor.channel)
                    // A saved web conversation can be resumed. Telegram only ever uses its current
                    // dialog.
                    if (!current.active)
                        throw IllegalStateException("Start a new conversation to continue")
                    current.organizationId?.let { profiles.requireOrganization(actor, it) }
                    val team = command.teamId ?: current.teamId
                    if (team != null) {
                        val data = activityData.team(actor, team)
                        require(
                            current.organizationId == null ||
                                data.organizationId == current.organizationId
                        )
                    }
                    val activity = command.activityId?.let { activityData.activity(actor, it) }
                    if (activity != null) {
                        require(
                            current.organizationId == null ||
                                current.organizationId == activity.organization.id
                        )
                        require(team == null || team == activity.team.id)
                    }
                    conversations.budget(actor.subject)
                    conversations.invalidate(actor.subject, id)
                    conversations.message(id, "user", "Du", null, command.text.trim())
                    conversations.advance(current, team, activity?.id ?: current.activityId)
                }
            )
        val current = overview.overview(actor)
        val catalogActivities = activityData.catalogActivities(actor)
        val organizations =
            identities.organizations(actor).filter {
                conversation.organizationId == null || it.id == conversation.organizationId
            }
        val catalogue =
            (current.teams.map { AssistantTeam(it.id, it.organization_id, it.name) } +
                    activityData.catalogTeams(actor))
                .distinctBy { it.id }
                .filter { team -> organizations.any { it.id == team.organizationId } }
        val plan =
            model.route(
                json.writeValueAsString(
                    mapOf(
                        "question" to command.text,
                        "organizations" to organizations,
                        "teams" to catalogue,
                        "activities" to
                            catalogActivities
                                .filter { activity ->
                                    organizations.any { it.id == activity.organization.id }
                                }
                                .map {
                                    mapOf(
                                        "id" to it.id,
                                        "title" to it.title,
                                        "organizationId" to it.organization.id,
                                        "teamId" to it.team.id,
                                        "startsAt" to it.starts_at,
                                    )
                                },
                        "clock" to current.reference_time,
                        "explicitTeamId" to conversation.teamId,
                        "explicitActivityId" to command.activityId,
                        "previousActivityId" to conversation.activityId,
                    )
                )
            )
        if (plan.clarification != null) {
            saveReply(actor, conversation, AssistantReply("Förena", null, plan.clarification), emit)
            return
        }
        val targets = plan.targets.distinctBy { it.organizationId }
        val questionText = command.text.lowercase(java.util.Locale.ROOT)
        val unresolved =
            plan.targets.any { target ->
                val clubTeams = catalogue.filter { it.organizationId == target.organizationId }
                val namedTeams = clubTeams.filter {
                    it.name.length >= 2 &&
                        questionText.contains(it.name.lowercase(java.util.Locale.ROOT))
                }
                val activityTeam =
                    command.activityId?.let { activityData.activity(actor, it).team.id }
                val teamAmbiguous =
                    target.teamId != null &&
                        clubTeams.size > 1 &&
                        target.teamId != command.teamId &&
                        target.teamId != conversation.teamId &&
                        target.teamId != activityTeam &&
                        namedTeams.singleOrNull()?.id != target.teamId
                val routedActivity =
                    target.activityId?.let { activityId ->
                        try {
                            activityData.activity(actor, activityId)
                        } catch (_: NoSuchElementException) {
                            null
                        }
                    }
                val currentDay =
                    routedActivity?.let { activity ->
                        val zone = java.time.ZoneId.of(activity.organization.time_zone)
                        activity.starts_at.atZone(zone).toLocalDate() ==
                            current.reference_time.atZone(zone).toLocalDate()
                    } == true
                val activityUnselected =
                    target.activityId != null &&
                        target.activityId != command.activityId &&
                        !(target.activityId == conversation.activityId && currentDay) &&
                        (routedActivity == null ||
                            !questionText.contains(
                                routedActivity.title.lowercase(java.util.Locale.ROOT)
                            ))
                teamAmbiguous || activityUnselected
            }
        if (unresolved) {
            saveReply(
                actor,
                conversation,
                AssistantReply(
                    "Förena",
                    null,
                    "Vilket lag och vilken aktivitet gäller det? Ange namnet så att jag kan ta fram rätt underlag.",
                ),
                emit,
            )
            return
        }
        require(targets.size <= 1 || targets.all { !it.question.isNullOrBlank() })
        require(
            targets.size <= organizations.size &&
                targets.all { target -> organizations.any { it.id == target.organizationId } }
        )
        if (targets.isEmpty()) {
            val memories = profiles.memories(actor, null, null, null, null)
            val answer =
                model.answer(
                    AssistantPrompts.rules,
                    json.writeValueAsString(
                        mapOf(
                            "question" to command.text,
                            "memories" to memories,
                            "viewer" to identities.viewer(actor, null, null),
                            "profile" to "Neutral personlig Förena-assistent",
                        )
                    ),
                )
            require(
                answer.activity == null &&
                    answer.series == null &&
                    answer.response == null &&
                    answer.attendance == null &&
                    answer.reminderActivityId == null &&
                    answer.duty == null
            )
            require(answer.memory == null || answer.memory.scope == "personal")
            val drafts = proposals.preview(actor, conversation, null, answer)
            saveReply(
                actor,
                conversation,
                AssistantReply("Förena", null, answer.answer, drafts),
                emit,
            )
            return
        }
        // Each club receives the current relevant question only, never other club replies or the
        // whole personal thread.
        targets.forEach { target ->
            emit.accept(
                AssistantReply(
                    organizations.single { it.id == target.organizationId }.name,
                    target.organizationId,
                    "",
                    pending = true,
                )
            )
        }
        val completedReplies = java.util.concurrent.ConcurrentLinkedQueue<AssistantReply>()
        Executors.newVirtualThreadPerTaskExecutor().use { executor ->
            val work = targets.map { target ->
                CompletableFuture.runAsync(
                    {
                        val reply =
                            try {
                                clubReply(actor, conversation, target, command, targets.size == 1)
                            } catch (_: Exception) {
                                AssistantReply(
                                    organizations.single { it.id == target.organizationId }.name,
                                    target.organizationId,
                                    "Uppgifter kunde inte hämtas för den här klubben. Försök igen; överblicken är ofullständig.",
                                    failed = true,
                                )
                            }
                        completedReplies.add(reply)
                        saveReply(actor, conversation, reply, emit)
                    },
                    executor,
                )
            }
            work.forEach { it.join() }
        }
        if (targets.size > 1) {
            val failures = completedReplies.filter { it.failed }
            val summary =
                if (failures.isNotEmpty()) {
                    "Överblicken är ofullständig. Uppgifter saknas från ${failures.joinToString { it.sender }}. Du kan fråga igen för att göra ett nytt försök."
                } else {
                    try {
                        model
                            .answer(
                                AssistantPrompts.rules,
                                json.writeValueAsString(
                                    mapOf(
                                        "profile" to "Neutral personlig Förena-assistent",
                                        "question" to command.text,
                                        "verifiedClubReplies" to
                                            completedReplies.map {
                                                mapOf("sender" to it.sender, "answer" to it.text)
                                            },
                                        "instruction" to
                                            "Sammanfatta kort. Inga nya fakta, förslag eller skrivningar. Ange vilken klubb varje uppgift kommer från.",
                                    )
                                ),
                            )
                            .answer
                    } catch (_: Exception) {
                        "Klubbarnas svar visas ovan. Någon gemensam sammanfattning kunde inte hämtas."
                    }
                }
            saveReply(
                actor,
                conversation,
                AssistantReply("Förena", null, summary, failed = failures.isNotEmpty()),
                emit,
            )
        }
    }

    private fun clubReply(
        actor: Actor,
        conversation: Conversation,
        target: AssistantTarget,
        command: MessageCommand,
        retainContext: Boolean,
    ): AssistantReply {
        sessions.requireActive(actor)
        val snapshot = overview.overview(actor)
        val organization =
            identities.organizations(actor).singleOrNull { it.id == target.organizationId }
                ?: throw AccessDeniedException("Organization access required")
        val profile = profiles.profile(actor, target.organizationId)
        val team = target.teamId?.let { activityData.team(actor, it) }
        require(team == null || team.organizationId == target.organizationId)
        val visible =
            activityData.catalogActivities(actor).filter {
                it.organization.id == target.organizationId &&
                    (team == null || it.team.id == team.teamId)
            }
        val explicit =
            (command.activityId ?: target.activityId)?.let { activityData.activity(actor, it) }
        val oldActivity =
            conversation.activityId?.let { id ->
                try {
                    activityData.activity(actor, id).takeIf {
                        it.starts_at
                            .atZone(java.time.ZoneId.of(it.organization.time_zone))
                            .toLocalDate() ==
                            snapshot.reference_time
                                .atZone(java.time.ZoneId.of(it.organization.time_zone))
                                .toLocalDate()
                    }
                } catch (_: NoSuchElementException) {
                    null
                }
            }
        val selected =
            (explicit ?: oldActivity)?.takeIf {
                it.organization.id == target.organizationId &&
                    (team == null || it.team.id == team.teamId)
            }
        if (
            retainContext &&
                (command.activityId != null || target.activityId != null || target.teamId != null)
        ) {
            transactions.executeWithoutResult {
                sessions.requireActive(actor)
                conversations.find(actor.subject, conversation.id, true)
                // Only an unambiguous single-club selection is retained for the next turn.
                if (
                    conversation.organizationId == target.organizationId ||
                        conversation.organizationId == null
                ) {
                    conversations.context(
                        conversation,
                        team?.teamId ?: selected?.team?.id,
                        selected?.id,
                    )
                }
            }
        }
        val clubQuestion = target.question ?: command.text
        transactions.executeWithoutResult {
            val locked = conversations.find(actor.subject, conversation.id, true)
            check(locked.active && locked.revision == conversation.revision)
            conversations.routedQuestion(conversation, target.organizationId, clubQuestion)
        }
        val thread = conversations.clubContext(conversation.id, target.organizationId)
        val context =
            mapOf(
                "question" to (target.question ?: command.text),
                "channel" to actor.channel,
                "clock" to snapshot.reference_time,
                "organization" to organization,
                "profile" to profile,
                "viewer" to identities.viewer(actor, target.organizationId, team?.teamId),
                "sectionInstructions" to
                    team?.sectionId?.let { profiles.section(actor, target.organizationId, it) },
                "documents" to
                    documents.read(actor, target.organizationId, team?.teamId, team?.sectionId),
                "members" to
                    members.read(actor, target.organizationId, team?.teamId, team?.sectionId),
                "team" to team,
                "dutyTargets" to
                    team?.takeIf { it.invitationAccess }?.let { duties.targets(actor, it.teamId) },
                "teams" to snapshot.teams.filter { it.organization_id == target.organizationId },
                "activities" to visible,
                "selectedActivity" to selected,
                "invitations" to selected?.let { activityData.invitations(actor, it.id) },
                "attendance" to
                    selected
                        ?.takeIf { it.can_manage_attendance }
                        ?.let { attendance.snapshot(actor, it.id) },
                "memories" to
                    profiles.memories(
                        actor,
                        target.organizationId,
                        team?.sectionId,
                        team?.teamId,
                        team?.discipline,
                    ),
                "clubConversationHistory" to thread,
                "history" to
                    if (target.historyFrom != null && target.historyThrough != null && team != null)
                        activityData.history(
                            actor,
                            team.teamId,
                            target.historyFrom,
                            target.historyThrough,
                        )
                    else null,
            )
        val answer = model.answer(AssistantPrompts.rules, json.writeValueAsString(context))
        val drafts = proposals.preview(actor, conversation, target, answer)
        return AssistantReply(profile.name, target.organizationId, answer.answer, drafts)
    }

    private fun saveReply(
        actor: Actor,
        expected: Conversation,
        reply: AssistantReply,
        emit: Consumer<AssistantReply>,
    ) {
        transactions.executeWithoutResult {
            sessions.requireActive(actor)
            val current = conversations.find(actor.subject, expected.id, true)
            check(current.active && current.revision == expected.revision)
            conversations.message(
                expected.id,
                "assistant",
                reply.sender,
                reply.organizationId,
                reply.text,
            )
        }
        synchronized(emit) { emit.accept(reply) }
    }
}
