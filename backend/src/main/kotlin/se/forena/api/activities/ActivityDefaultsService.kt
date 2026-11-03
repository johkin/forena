package se.forena.api.activities

import java.time.Instant
import java.time.ZoneId
import java.util.UUID
import org.springframework.security.access.AccessDeniedException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional
import se.forena.api.activities.internal.*
import se.forena.api.administration.AdministrationService
import se.forena.api.extensionapi.DisciplineCatalog
import se.forena.api.identity.Actor
import se.forena.api.identity.SessionService
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper

@Service
class ActivityDefaultsService(
    private val sessions: SessionService,
    private val permissions: TeamAccessService,
    private val administration: AdministrationService,
    private val teams: ManagementRepository,
    private val types: ActivityTypeRepository,
    private val defaults: ActivityDefaultsRepository,
    private val catalog: DisciplineCatalog,
    private val json: JsonMapper,
) {
    private val timingFields =
        setOf("duration", "gatheringRule", "invitationRule", "responseDueRule", "reminderRules")

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    fun load(actor: Actor, scope: String, id: UUID): DefaultsWorkspace =
        workspace(actor, scope, id, false)

    @Transactional
    fun save(actor: Actor, command: DefaultsCommand): DefaultsWorkspace {
        val context = workspace(actor, command.scope, command.scopeId, true)
        require(context.types.any { it.id == command.activityTypeId })
        validate(command.values, context.disciplineKey)
        val previous =
            context.rows.singleOrNull {
                it.scope == command.scope && it.activityTypeId == command.activityTypeId
            }
        check(command.revision == (previous?.revision ?: 0))
        check(previous == null || previous.version == context.version)
        val id = previous?.id ?: UUID.randomUUID()
        val value = json.writeValueAsString(command.values)
        if (previous == null)
            defaults.insert(
                id,
                context.organizationId,
                if (command.scope == "section") command.scopeId else null,
                if (command.scope == "team") command.scopeId else null,
                command.activityTypeId,
                context.disciplineKey,
                context.version,
                value,
            )
        else check(defaults.update(id, command.revision, value) == 1)
        defaults.audit(UUID.randomUUID(), id, actor.subject, command.revision + 1)
        return workspace(actor, command.scope, command.scopeId, false)
    }

    private fun workspace(
        actor: Actor,
        scope: String,
        id: UUID,
        writing: Boolean,
    ): DefaultsWorkspace {
        sessions.requireActive(actor)
        require(scope in listOf("section", "team"))
        val organization: UUID
        val sectionId: UUID?
        val discipline: String
        if (scope == "team") {
            if (!permissions.canManageActivities(actor, id))
                throw AccessDeniedException("Activity defaults access required")
            if (writing) check(teams.lockTeam(id) != null)
            if (!permissions.canManageActivities(actor, id))
                throw AccessDeniedException("Activity defaults access required")
            val team = teams.team(id) ?: throw NoSuchElementException()
            organization = team.organizationId
            sectionId = team.sectionId
            discipline = team.disciplineKey ?: "common"
        } else {
            val section = administration.sectionDefaultsContext(actor, id, writing)
            organization = section.organizationId
            sectionId = id
            discipline = section.disciplineKey
        }
        val rows =
            defaults.defaults(
                organization,
                if (scope == "team") id else UUID(0, 0),
                sectionId,
                discipline,
            )
        return DefaultsWorkspace(
            organization,
            scope,
            id,
            sectionId,
            discipline,
            catalog.find(discipline)?.definition?.version ?: "1.0.0",
            types
                .catalogue(organization)
                .filter {
                    it.active && (it.disciplineKey == null || it.disciplineKey == discipline)
                }
                .map {
                    ManagedActivityType(
                        it.id,
                        it.name,
                        it.slug,
                        it.systemCategory,
                        it.organizationId,
                    )
                },
            rows.map {
                ActivityDefaultsRow(
                    it.id,
                    it.activityTypeId,
                    if (it.teamId == null) "section" else "team",
                    it.teamId ?: requireNotNull(it.sectionId),
                    it.disciplineKey,
                    it.version,
                    it.revision,
                    it.valuesJson,
                )
            },
        )
    }

    private fun validate(values: JsonNode, discipline: String) {
        require(values.isObject)
        require(
            values.propertyNames().all {
                it in timingFields || it in setOf("options", "capabilities")
            }
        )
        fun timing(field: String, value: JsonNode) {
            require(value.isString)
            val text = value.stringValue()
            if (field == "duration") ActivityTimes.minutes(text)
            else
                ActivityTimes.evaluate(
                    text,
                    if (field == "reminderRules") "deadline" else "start",
                    Instant.parse("2030-01-15T12:00:00Z"),
                    ZoneId.of("Europe/Stockholm"),
                )
            if (field in listOf("invitationRule", "reminderRules")) {
                val anchor = Instant.parse("2030-01-15T12:00:00Z")
                require(
                    ActivityTimes.evaluate(
                        text,
                        if (field == "reminderRules") "deadline" else "start",
                        anchor,
                        ZoneId.of("Europe/Stockholm"),
                    ) < anchor
                )
            }
        }
        timingFields.forEach { field ->
            values
                .get(field)
                ?.takeUnless { it.isNull }
                ?.let { value ->
                    if (field == "reminderRules") {
                        require(value.isArray && value.size() <= 5)
                        value.forEach { timing(field, it) }
                        require(value.toList().distinct().size == value.size())
                    } else timing(field, value)
                }
        }
        values
            .get("options")
            ?.takeUnless { it.isNull }
            ?.let { options ->
                require(options.isObject)
                options.properties().forEach { (field, value) ->
                    require(field in timingFields)
                    if (!value.isNull) {
                        require(
                            value.isArray &&
                                value.size() in 1..32 &&
                                value.toList().distinct().size == value.size()
                        )
                        value.forEach { timing(field, it) }
                    }
                }
            }
        values
            .get("capabilities")
            ?.takeUnless { it.isNull }
            ?.let { capabilities ->
                require(capabilities.isObject)
                val supported =
                    catalog
                        .find(discipline)
                        ?.definition
                        ?.capabilities
                        .orEmpty()
                        .filter { it.configurationScope == "activityDefaults" }
                        .map { it.key }
                        .toSet()
                capabilities.properties().forEach { (key, settings) ->
                    require(key in supported && settings.isObject)
                    require(
                        settings.propertyNames().all {
                            it in setOf("notificationsEnabled", "notificationHours")
                        }
                    )
                    settings.get("notificationsEnabled")?.let { require(it.isNull || it.isBoolean) }
                    settings
                        .get("notificationHours")
                        ?.takeUnless { it.isNull }
                        ?.let { hours ->
                            require(
                                hours.isArray &&
                                    hours.size() <= 5 &&
                                    hours.toList().distinct().size == hours.size()
                            )
                            hours.forEach {
                                require(
                                    it.isIntegralNumber &&
                                        it.canConvertToInt() &&
                                        it.intValue() in 1..720
                                )
                            }
                        }
                }
            }
    }
}
