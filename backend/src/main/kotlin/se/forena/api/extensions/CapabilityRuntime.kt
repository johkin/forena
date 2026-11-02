package se.forena.api.extensions

import java.time.Instant
import java.util.UUID
import org.springframework.beans.factory.ObjectProvider
import org.springframework.context.event.EventListener
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import se.forena.api.activities.AssistantActivityService
import se.forena.api.activities.FollowUpAccess
import se.forena.api.extensionapi.*
import se.forena.api.extensions.internal.*
import se.forena.api.identity.Actor
import tools.jackson.databind.json.JsonMapper

@Service
class CapabilityRuntime(
    private val access: FollowUpAccess,
    private val catalog: DisciplineCatalog,
    private val repository: CapabilityRepository,
    private val values: DisciplineValueRepository,
    private val json: JsonMapper,
    private val notifier: ExtensionNotifier,
    private val assistant: ObjectProvider<AssistantActivityService>,
) {

    fun created(activity: DisciplineActivity) {
        val pkg = catalog.find(activity.disciplineKey) ?: return
        if (!pkg.appliesTo(activity.kind)) return
        access
            .capabilitySettings(activity.id)
            .filter { it.enabled && it.hours.isNotEmpty() }
            .forEach { settings ->
                repository.insert(
                    activity.id,
                    settings.key,
                    pkg.definition.key,
                    pkg.definition.version,
                    settings.version,
                    settings.enabled,
                    json.writeValueAsString(settings.hours),
                )
            }
        repository.invalidate(activity.id)
    }

    @EventListener
    @Transactional(propagation = Propagation.MANDATORY)
    fun inputsChanged(event: DisciplineInputsChanged) {
        event.activityId?.let { repository.invalidate(it) }
        event.teamId?.let { team ->
            access.futureActivityIds(team).forEach { repository.invalidate(it) }
        }
    }

    fun changed(activity: UUID) {
        repository.invalidate(activity)
    }

    fun invited(activityId: UUID, actorId: UUID, added: Int) {
        repository.invalidate(activityId)
        repository
            .activitySignals(activityId)
            .filter { it.state == "active" }
            .forEach {
                repository.action(
                    UUID.randomUUID(),
                    it.id,
                    it.episode,
                    actorId,
                    "invite-more-players",
                    "invited:$added",
                )
            }
    }

    @Transactional(readOnly = true)
    fun due(limit: Int) = repository.due(access.now(), limit.coerceIn(1, 100))

    @Transactional
    fun failed(id: UUID, revision: Long) {
        repository.failed(id, revision)
    }

    @Transactional
    fun process(id: UUID) {
        val activity = access.lockSystemActivity(id) ?: return
        val job = repository.lock(id) ?: return
        val now = access.now()
        val rules = repository.rules(id).associateBy { it.capabilityKey }
        val currentPackage = catalog.find(activity.disciplineKey)
        val stored = values.value(activity.teamId, activity.disciplineKey, "activity", id, null)
        val pkg =
            stored?.let { catalog.find(it.disciplineKey, it.packageVersion) } ?: currentPackage
        val counts = access.capabilityCounts(id)
        val old = repository.activitySignals(id)
        val active = mutableSetOf<UUID>()
        val next = mutableListOf<Instant>()
        pkg?.activityCapabilities.orEmpty().forEach { capability ->
            val key = capability.definition.key
            val rule = rules[key]
            val previous = old.singleOrNull {
                it.disciplineKey == pkg?.definition?.key && it.capabilityKey == key
            }
            val hours =
                rule?.let { json.readTree(it.hoursJson).toList().map { node -> node.intValue() } }
                    ?: capability.defaultHours
            val eligible =
                activity.status == "scheduled" &&
                    !activity.imported &&
                    !activity.cancelled &&
                    currentPackage?.definition?.key == pkg?.definition?.key &&
                    pkg?.appliesTo(activity.kind) == true &&
                    (rule == null || rule.definitionVersion == capability.definition.version)
            val context =
                CapabilityContext(
                    id,
                    activity.title,
                    activity.kind,
                    activity.startsAt,
                    now,
                    eligible,
                    stored?.let { json.readTree(it.valuesJson) } ?: json.createObjectNode(),
                    counts.invited,
                    counts.accepted,
                    counts.pending,
                    activity.responseDueAt,
                    previous?.let { repository.lastReminder(it.id) },
                    hours,
                )
            val evaluation = capability.evaluate(context)
            evaluation.nextEvaluationAt?.let { next.add(it) }
            evaluation.signal?.let { signal ->
                val signalId = previous?.id ?: UUID.randomUUID()
                active.add(signalId)
                val state = if (previous?.state == "dismissed") "dismissed" else "active"
                val episode = (previous?.episode ?: 1) + if (previous?.state == "resolved") 1 else 0
                if (previous == null)
                    repository.signal(
                        signalId,
                        id,
                        activity.teamId,
                        requireNotNull(pkg).definition.key,
                        key,
                        signal.type,
                        signal.severity,
                        signal.title,
                        signal.text,
                        json.writeValueAsString(signal.actions),
                        now,
                    )
                else
                    check(
                        repository.updateSignal(
                            signalId,
                            previous.revision,
                            state,
                            signal.severity,
                            signal.title,
                            signal.text,
                            json.writeValueAsString(signal.actions),
                            episode,
                            now,
                        ) == 1
                    )
                val checkpoint = evaluation.checkpoint
                if (
                    rule?.notificationsEnabled == true &&
                        state != "dismissed" &&
                        checkpoint != null &&
                        checkpoint !in repository.checkpoints(id, key) &&
                        repository.checkpoint(id, key, checkpoint) == 1
                ) {
                    notifier.enqueue(
                        id,
                        "$key:$checkpoint",
                        access.capabilityRecipients(activity.teamId),
                        requireNotNull(evaluation.notificationTitle),
                        requireNotNull(evaluation.notificationBody),
                    )
                }
            }
        }
        old.filter { it.id !in active && it.state != "resolved" }
            .forEach {
                check(
                    repository.updateSignal(
                        it.id,
                        it.revision,
                        "resolved",
                        it.severity,
                        it.title,
                        it.text,
                        "[]",
                        it.episode,
                        now,
                    ) == 1
                )
            }
        check(repository.evaluated(id, job.revision, next.minOrNull()) == 1)
    }

    @Transactional(readOnly = true)
    fun list(actor: Actor, team: UUID): List<SignalSnapshot> {
        access.authorizeSignals(actor, team)
        val rows = repository.signals(team)
        val history =
            if (rows.isEmpty()) emptyMap()
            else repository.history(rows.map { it.id }).groupBy { it.signalId }
        return rows.map { row ->
            SignalSnapshot(
                row.id,
                row.activityId,
                row.state,
                row.severity,
                row.title,
                row.text,
                json.readTree(row.actionsJson).toList().map { it.stringValue() },
                row.revision,
                row.episode,
                row.evaluatedAt,
                history[row.id].orEmpty().map { SignalAction(it.action, it.result, it.createdAt) },
            )
        }
    }

    @Transactional
    fun action(actor: Actor, id: UUID, command: SignalCommand) {
        val initial = repository.signal(id) ?: throw NoSuchElementException()
        access.authorizeSignals(actor, initial.teamId)
        access.lockSystemActivity(initial.activityId) ?: throw NoSuchElementException()
        access.authorizeSignals(actor, initial.teamId)
        val before = repository.signal(id) ?: throw NoSuchElementException()
        check(before.revision == command.revision && before.state == "active")
        // Evaluate under the same activity lock so expired actions cannot be submitted from old UI.
        process(before.activityId)
        val current = repository.signal(id) ?: throw NoSuchElementException()
        check(current.state == "active")
        require(command.action in listOf("dismiss", "remind-unanswered"))
        if (command.action == "remind-unanswered") {
            require(
                json.readTree(current.actionsJson).toList().any {
                    it.stringValue() == command.action
                }
            )
            assistant.getObject().queueReminder(actor, current.activityId)
        } else
            check(
                repository.updateSignal(
                    id,
                    current.revision,
                    "dismissed",
                    current.severity,
                    current.title,
                    current.text,
                    current.actionsJson,
                    current.episode,
                    access.now(),
                ) == 1
            )
        repository.action(
            UUID.randomUUID(),
            id,
            current.episode,
            actor.subject,
            command.action,
            if (command.action == "dismiss") "dismissed" else "queued",
        )
        repository.invalidate(current.activityId)
    }
}

data class SignalAction(val action: String, val result: String, val createdAt: Instant)

data class SignalSnapshot(
    val id: UUID,
    val activityId: UUID,
    val state: String,
    val severity: String,
    val title: String,
    val text: String,
    val actions: List<String>,
    val revision: Long,
    val episode: Long,
    val evaluatedAt: Instant,
    val history: List<SignalAction>,
)

data class SignalCommand(val revision: Long, val action: String)
