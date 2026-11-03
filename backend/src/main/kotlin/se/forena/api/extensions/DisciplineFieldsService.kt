package se.forena.api.extensions

import java.util.UUID
import org.springframework.security.access.AccessDeniedException
import org.springframework.context.event.EventListener
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.annotation.Propagation
import se.forena.api.activities.DisciplineObject
import se.forena.api.activities.DisciplineObjects
import se.forena.api.activities.DisciplineTarget
import se.forena.api.extensionapi.*
import se.forena.api.extensions.internal.DisciplineValueRepository
import se.forena.api.identity.Actor
import se.forena.api.identity.DatabaseClockService
import tools.jackson.databind.json.JsonMapper
import tools.jackson.databind.node.ObjectNode

@Service
class DisciplineFieldsService(
    private val objects: DisciplineObjects,
    private val catalog: DisciplineCatalog,
    private val repository: DisciplineValueRepository,
    private val json: JsonMapper,
    private val clock: DatabaseClockService,
    private val information: InformationService,
    private val capabilities: CapabilityRuntime,
) : DisciplineActivityLifecycle {
    @Transactional(readOnly = true)
    fun roster(actor: Actor, team: UUID) = objects.roster(actor, team)

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    fun read(actor: Actor, target: DisciplineTarget): DisciplineFieldsSnapshot =
        snapshot(target, objects.resolve(actor, target))

    @Transactional
    fun save(actor: Actor, command: DisciplineFieldsCommand): DisciplineFieldsSnapshot {
        val target =
            DisciplineTarget(command.teamId, command.scope, command.activityId, command.personId)
        val obj = objects.resolve(actor, target, writing = true)
        check(obj.editable)
        require(command.disciplineKey == obj.disciplineKey)
        val row =
            repository.value(
                obj.teamId,
                obj.disciplineKey,
                target.scope.name,
                obj.anchorId,
                obj.personId,
            )
        check(command.revision == (row?.revision ?: 0))
        check(row == null || row.packageVersion == command.version)
        val pkg =
            catalog.find(obj.disciplineKey, command.version)
                ?: throw IllegalArgumentException("Unknown discipline version")
        require(command.values.isObject)
        val fields = pkg.definition.fields[target.scope].orEmpty()
        val permitted = fields.filter { allowed(it.write, obj) }.map { it.key }.toSet()
        if (command.values.propertyNames().any { it !in permitted })
            throw AccessDeniedException("Field write denied")
        val previous = row?.let { json.readTree(it.valuesJson) } ?: json.createObjectNode()
        check(previous is ObjectNode)
        // Preserve hidden fields, including a captain that only invitation managers may change.
        val values = previous.deepCopy()
        permitted.forEach { values.remove(it) }
        command.values.properties().forEach { (key, value) -> values.set(key, value) }
        // A hidden player reference is preserved without revalidating a withheld candidate list.
        val validation = values.deepCopy()
        if (!obj.canManageInvitations)
            fields
                .filter { it.write == FieldAudience.invitations }
                .forEach { validation.remove(it.key) }
        pkg.validate(target.scope, validation, obj.context)
        val id = row?.id ?: UUID.randomUUID()
        if (row == null)
            repository.insert(
                id,
                obj.organizationId,
                obj.teamId,
                obj.disciplineKey,
                command.version,
                target.scope.name,
                obj.anchorId,
                obj.activityId,
                obj.personId,
                1,
                json.writeValueAsString(values),
            )
        else check(repository.update(id, row.revision, json.writeValueAsString(values)) == 1)
        repository.audit(UUID.randomUUID(), id, actor.subject, command.revision + 1, clock.now())
        target.activityId?.let { capabilities.changed(it) }
        return snapshot(target, obj)
    }

    override fun created(activity: DisciplineActivity) {
        initialize(activity)
        initializeParticipants(activity.id)
        information.schedule(activity.id)
    }

    override fun updated(activity: DisciplineActivity, previousKind: ActivityKind) {
        val pkg = catalog.find(activity.disciplineKey)
        val entering = pkg?.appliesTo(activity.kind) == true && !pkg.appliesTo(previousKind)
        if (entering) {
            initialize(activity)
            initializeParticipants(activity.id)
        }
        changed(activity.id)
    }

    private fun initialize(activity: DisciplineActivity) {
        val pkg = catalog.find(activity.disciplineKey) ?: return
        if (!pkg.appliesTo(activity.kind)) return
        // The first applicable state owns the snapshot. Leaving/re-entering must not replace
        // user edits, saved rules or durable notification checkpoints with newer team defaults.
        val existing =
            repository.value(activity.teamId, activity.disciplineKey, "activity", activity.id, null)
        if (existing != null) return
        capabilities.created(activity)
        val team =
            repository.value(activity.teamId, activity.disciplineKey, "team", activity.teamId, null)
        check(team == null || team.packageVersion == pkg.definition.version)
        val values =
            pkg.initialActivityValues(
                team?.let { json.readTree(it.valuesJson) } ?: json.createObjectNode()
            )
        repository.insert(
            UUID.randomUUID(),
            activity.organizationId,
            activity.teamId,
            activity.disciplineKey,
            pkg.definition.version,
            "activity",
            activity.id,
            activity.id,
            null,
            1,
            json.writeValueAsString(values),
        )
    }

    override fun invited(activityId: UUID, actorId: UUID, added: Int) {
        initializeParticipants(activityId)
        capabilities.invited(activityId, actorId, added)
    }

    @EventListener
    @Transactional(propagation = Propagation.MANDATORY)
    fun participantsAdded(event: DisciplineParticipantsAdded) {
        initializeParticipants(event.activityId)
    }

    private fun initializeParticipants(activityId: UUID) {
        val (activity, players) = objects.participationDefaults(activityId) ?: return
        val activityValues = repository.value(activity.teamId, activity.disciplineKey, "activity", activity.id, null)
        val pkg = catalog.find(activity.disciplineKey, activityValues?.packageVersion) ?: return
        if (!pkg.appliesTo(activity.kind) || pkg.definition.fields[DisciplineScope.activityParticipation].isNullOrEmpty()) return
        val existing = repository.participationValues(activityId, activity.disciplineKey).map { it.personId }.toSet()
        val missing = players.filter { it !in existing }
        if (missing.isEmpty()) return
        val memberships = repository.membershipValues(activity.teamId, activity.disciplineKey, missing).associateBy { it.personId }
        for (person in missing) {
            val source = memberships[person]?.let { json.readTree(it.valuesJson) } ?: json.createObjectNode()
            val values = pkg.initialParticipationValues(source)
            // Even an empty snapshot is retained so later team edits cannot rewrite a match.
            repository.insert(UUID.randomUUID(), activity.organizationId, activity.teamId,
                activity.disciplineKey, pkg.definition.version, "activityParticipation", activity.id,
                activity.id, person, 1, json.writeValueAsString(values))
        }
    }

    override fun changed(activityId: UUID) {
        information.schedule(activityId)
        capabilities.changed(activityId)
    }

    private fun snapshot(
        target: DisciplineTarget,
        obj: DisciplineObject,
    ): DisciplineFieldsSnapshot {
        val row =
            repository.value(
                obj.teamId,
                obj.disciplineKey,
                target.scope.name,
                obj.anchorId,
                obj.personId,
            )
        val pkg = catalog.find(obj.disciplineKey, row?.packageVersion)
        val applies =
            target.scope !in
                setOf(DisciplineScope.activity, DisciplineScope.activityParticipation) ||
                obj.context.activityKind?.let { pkg?.appliesTo(it) } == true
        val fields =
            if (applies)
                pkg?.definition?.fields?.get(target.scope).orEmpty().filter {
                    allowed(it.read, obj)
                }
            else emptyList()
        val values = json.createObjectNode()
        row?.let { json.readTree(it.valuesJson) }
            ?.let { stored ->
                fields.forEach { field -> stored.get(field.key)?.let { values.set(field.key, it) } }
            }
        return DisciplineFieldsSnapshot(
            obj.disciplineKey,
            pkg?.definition?.version,
            fields.isNotEmpty(),
            obj.editable && fields.any { allowed(it.write, obj) },
            obj.canManageInvitations,
            fields,
            values,
            row?.revision ?: 0,
            obj.teamPlayers,
            obj.acceptedPlayers,
            obj.participants,
            pkg?.definition?.scopeTitles?.get(target.scope) ?: "Disciplinuppgifter",
        )
    }

    private fun allowed(audience: FieldAudience, obj: DisciplineObject) =
        when (audience) {
            FieldAudience.managers -> obj.canManage
            FieldAudience.invitations -> obj.canManage && obj.canManageInvitations
            FieldAudience.team -> obj.canManage || obj.teamMember
        }
}
