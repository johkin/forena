package se.forena.api.extensions

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID
import org.springframework.security.access.AccessDeniedException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional
import se.forena.api.activities.*
import se.forena.api.administration.AdministrationAuthority
import se.forena.api.administration.AdministrationService
import se.forena.api.extensionapi.*
import se.forena.api.extensions.internal.*
import se.forena.api.identity.Actor
import se.forena.api.identity.RosterDirectory
import tools.jackson.databind.json.JsonMapper

@Service
class InformationService(
    private val access: FollowUpAccess,
    private val catalog: DisciplineCatalog,
    private val repository: InformationRepository,
    private val json: JsonMapper,
    private val directory: RosterDirectory,
    private val administration: AdministrationService,
    private val objects: DisciplineObjects,
    private val notifier: ExtensionNotifier,
) : AttendanceOutcomeGuard {

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    fun snapshot(actor: Actor, id: UUID): InformationSnapshot {
        val facts = access.facts(actor, id)
        val pkg = packageFor(facts.activity)
        val rows = repository.activity(id)
        val enabled = enabledContributors(pkg, facts.activity.teamId)
        val definitions = (enabled + rows.map(::contributor)).distinctBy { it.information.key }
        val contributions = definitions.map { definition ->
            val row = rows.singleOrNull { it.ownerKey == definition.information.key }
            InformationItem(
                row?.let(::contributor)?.information ?: definition.information,
                row?.revision ?: 0,
                row?.state ?: "open",
                row?.closeReason,
                row?.let { json.readTree(it.valuesJson) } ?: json.createObjectNode(),
            )
        }
        val byId = rows.associateBy { it.id }
        return InformationSnapshot(
            id,
            facts.activity.title,
            facts.attendanceRevision,
            facts.canManageAttendance,
            !facts.activity.cancelled && facts.activity.endsAt <= access.now(),
            facts.presentPlayers,
            contributions,
            repository.history(id).map { history ->
                InformationHistory(
                    byId.getValue(history.informationId).ownerKey,
                    history.revision,
                    history.actorName,
                    history.changedAt,
                    json.readTree(history.previousJson),
                    json.readTree(history.valuesJson),
                    history.state,
                    json.readTree(history.namesJson).properties().associate { (key, value) ->
                        key to value.stringValue()
                    },
                )
            },
        )
    }

    @Transactional
    fun save(
        actor: Actor,
        id: UUID,
        answers: List<InformationAnswer>,
        proposedPlayers: List<DisciplinePlayer>? = null,
    ) {
        val facts = access.facts(actor, id, lock = true)
        check(!facts.activity.cancelled && facts.activity.endsAt <= access.now())
        check(facts.attendanceRevision > 0)
        require(
            answers.isNotEmpty() &&
                answers.size <= 100 &&
                answers.map { it.ownerKey }.distinct().size == answers.size
        )
        val pkg = packageFor(facts.activity)
        val rows = repository.activity(id).associateBy { it.ownerKey }
        val active =
            enabledContributors(pkg, facts.activity.teamId).associateBy { it.information.key }
        val candidates = (proposedPlayers ?: facts.presentPlayers).map { it.id }.toSet()
        for (answer in answers) {
            val previous = rows[answer.ownerKey]
            val owner = previous?.let(::contributor) ?: requireNotNull(active[answer.ownerKey])
            check(previous?.state != "closed" || previous.closeReason == "capability_disabled")
            check(answer.revision == (previous?.revision ?: 0))
            owner.validate(answer.values, candidates)
            val state =
                if (owner.complete(answer.values)) "answered"
                else if (answer.ownerKey in active) "open" else "closed"
            val reason = if (state == "closed") "capability_disabled" else null
            val value = json.writeValueAsString(answer.values)
            val rowId = previous?.id ?: UUID.randomUUID()
            if (previous == null)
                repository.insert(
                    rowId,
                    id,
                    facts.activity.teamId,
                    facts.activity.organizationId,
                    owner.information.key,
                    owner.information.version,
                    pkg.definition.key,
                    pkg.definition.version,
                    value,
                    state,
                    access.now(),
                )
            else check(repository.update(rowId, previous.revision, value, state, reason) == 1)
            repository.history(
                UUID.randomUUID(),
                rowId,
                answer.revision + 1,
                actor.subject,
                directory.actorName(facts.activity.organizationId, actor.subject),
                access.now(),
                previous?.valuesJson ?: "{}",
                value,
                state,
                json.writeValueAsString(
                    (facts.presentPlayers + proposedPlayers.orEmpty()).associate {
                        it.id.toString() to it.name
                    }
                ),
            )
        }
    }

    override fun validateAttendance(activityId: UUID, presentPlayerIds: Set<UUID>) {
        repository.activity(activityId).forEach { row ->
            val references = contributor(row).referencedPlayers(json.readTree(row.valuesJson))
            check(references.all { it in presentPlayerIds }) {
                "Correct activity outcomes together with attendance"
            }
        }
    }

    @Transactional(readOnly = true)
    fun settings(actor: Actor, team: UUID): List<CapabilitySetting> {
        val key =
            try {
                access.teamDiscipline(actor, team)
            } catch (_: AccessDeniedException) {
                objects.resolve(actor, DisciplineTarget(team, DisciplineScope.team)).disciplineKey
            }
        val definitions =
            catalog.find(key)?.definition?.capabilities.orEmpty().filter {
                it.configurationScope == "team"
            }
        val stored = repository.settings(team).associateBy { it.capabilityKey }
        val canConfigure =
            try {
                administration.authorizeMutation(actor, AdministrationAuthority.TeamBusiness(team))
                true
            } catch (_: AccessDeniedException) {
                false
            }
        return definitions.map { definition ->
            CapabilitySetting(
                definition.key,
                definition.name,
                stored[definition.key]?.enabled ?: definition.enabledByDefault,
                definition.adjustable,
                stored[definition.key]?.revision ?: 0,
                canConfigure && definition.adjustable,
            )
        }
    }

    @Transactional
    fun configure(actor: Actor, team: UUID, change: CapabilityChange) {
        administration.authorizeMutation(actor, AdministrationAuthority.TeamBusiness(team))
        val obj =
            objects.resolve(actor, DisciplineTarget(team, DisciplineScope.team), writing = true)
        administration.authorizeMutation(actor, AdministrationAuthority.TeamBusiness(team))
        val pkg = catalog.find(obj.disciplineKey) ?: throw IllegalArgumentException()
        val definition =
            requireNotNull(pkg.definition.capabilities.singleOrNull { it.key == change.key })
        require(definition.adjustable && definition.configurationScope == "team")
        val previous = repository.settings(team).singleOrNull { it.capabilityKey == change.key }
        check(change.revision == (previous?.revision ?: 0))
        repository.setting(team, change.key, change.enabled, access.now())
        repository.auditSetting(
            UUID.randomUUID(),
            team,
            change.key,
            change.revision + 1,
            change.enabled,
            actor.subject,
        )
        if (!change.enabled) {
            val owners =
                pkg.informationContributors.filter { it.information.capabilityKey == change.key }
            // Pending jobs are included even before they have created a request. Waiting for their
            // activity lock lets us close a request created concurrently with deactivation.
            val ids =
                repository.pendingActivities(team) +
                    owners.flatMap { owner ->
                        repository.open(team, owner.information.key).map { it.activityId }
                    }
            ids.distinct().sorted().forEach { id ->
                access.lockSystemActivity(id)
                administration.authorizeMutation(actor, AdministrationAuthority.TeamBusiness(team))
                repository
                    .open(id)
                    .filter { row -> owners.any { it.information.key == row.ownerKey } }
                    .forEach { close(it, "capability_disabled", actor) }
            }
        }
    }

    fun schedule(id: UUID) {
        val activity = access.systemActivity(id) ?: return
        if (activity.cancelled) {
            repository
                .activity(id)
                .filter { it.state == "open" }
                .forEach { close(it, "activity_cancelled", null) }
            repository.finish(id)
        } else if (catalog.find(activity.disciplineKey)?.appliesTo(activity.kind) == true) {
            repository.schedule(id, activity.teamId, activity.endsAt)
        }
    }

    @Transactional
    fun process(id: UUID): Boolean {
        // All mutation paths acquire activity before request/job locks.
        val activity = access.lockSystemActivity(id) ?: return false
        val job = repository.lockJob(id) ?: return false
        if (job.dueAt > access.now()) return false
        if (activity.cancelled) {
            schedule(id)
            return true
        }
        if (activity.endsAt > access.now()) {
            repository.schedule(id, activity.teamId, activity.endsAt)
            return true
        }
        val pkg = catalog.find(activity.disciplineKey)
        if (pkg == null || !pkg.appliesTo(activity.kind)) {
            repository.finish(id)
            return true
        }
        val existing = repository.activity(id).associateBy { it.ownerKey }
        val settings = repository.settings(activity.teamId).associateBy { it.capabilityKey }
        var created = false
        enabledContributors(pkg, activity.teamId).forEach { owner ->
            val activated = owner.information.capabilityKey?.let { settings[it]?.enabledAt }
            if (
                owner.information.key !in existing &&
                    (activated == null || activity.endsAt > activated)
            ) {
                repository.insert(
                    UUID.randomUUID(),
                    id,
                    activity.teamId,
                    activity.organizationId,
                    owner.information.key,
                    owner.information.version,
                    pkg.definition.key,
                    pkg.definition.version,
                    "{}",
                    "open",
                    access.now(),
                )
                created = true
            }
        }
        if (created)
            notifier.enqueue(
                id,
                "followup",
                access.leaderRecipients(activity.teamId),
                "Matchuppföljning",
                "Följ upp ${activity.title}: registrera närvaro och matchuppgifter i Förena.",
            )
        repository.finish(id)
        return true
    }

    @Transactional(readOnly = true) fun due(limit: Int) = repository.due(access.now(), limit)

    @Transactional
    fun failed(id: UUID) {
        access.lockSystemActivity(id) ?: return
        repository.lockJob(id) ?: return
        repository.failed(id)
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    fun report(actor: Actor, team: UUID, from: Instant, until: Instant): InformationReport {
        val activities =
            access.teamActivities(actor, team, from, until).filter { activity ->
                !activity.cancelled &&
                    activity.endsAt <= access.now() &&
                    catalog.find(activity.disciplineKey)?.appliesTo(activity.kind) == true
            }
        val rows =
            if (activities.isEmpty()) emptyList()
            else repository.activities(activities.map { it.id })
        val byActivity = rows.groupBy { it.activityId }
        val players = access.players(actor, team, activities.map { it.id })
        return InformationReport(
            team,
            from,
            until,
            activities.map { activity ->
                val saved = byActivity[activity.id].orEmpty()
                val owners =
                    (enabledContributors(packageFor(activity), team) + saved.map(::contributor))
                        .distinctBy { it.information.key }
                InformationReportEntry(
                    activity.id,
                    activity.title,
                    activity.startsAt,
                    owners.map { owner ->
                        val row = saved.singleOrNull { it.ownerKey == owner.information.key }
                        InformationItem(
                            row?.let(::contributor)?.information ?: owner.information,
                            row?.revision ?: 0,
                            row?.state ?: "open",
                            row?.closeReason,
                            row?.let { json.readTree(it.valuesJson) } ?: json.createObjectNode(),
                        )
                    },
                )
            },
            players,
        )
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    fun periodReport(
        actor: Actor,
        team: UUID,
        fromDate: LocalDate?,
        untilDate: LocalDate?,
        season: Int?,
    ): InformationPeriodReport {
        val period = access.reportPeriod(actor, team)
        val zone = ZoneId.of(period.timeZone)
        val currentYear = access.now().atZone(zone).year
        val configuredYear = period.season.toIntOrNull()?.takeIf { it in 1900..2200 } ?: currentYear
        val year = season ?: configuredYear
        require(year in 1900..2200)
        val from = fromDate ?: LocalDate.of(year, 1, 1)
        val until = untilDate ?: LocalDate.of(year + 1, 1, 1)
        return InformationPeriodReport(
            period.timeZone,
            period.season,
            from,
            until,
            report(
                actor,
                team,
                from.atStartOfDay(zone).toInstant(),
                until.atStartOfDay(zone).toInstant(),
            ),
        )
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    fun pending(actor: Actor, team: UUID): List<PendingInformation> {
        val activities =
            access
                .teamActivities(actor, team, Instant.parse("1900-01-01T00:00:00Z"), access.now())
                .filter { !it.cancelled && it.endsAt <= access.now() }
        if (activities.isEmpty()) return emptyList()
        val requests =
            repository
                .activities(activities.map { it.id })
                .filter { it.state == "open" }
                .groupBy { it.activityId }
        return activities.mapNotNull { activity ->
            requests[activity.id]?.let { rows ->
                PendingInformation(
                    activity.id,
                    activity.title,
                    activity.startsAt,
                    rows.map { contributor(it).information.title },
                )
            }
        }
    }

    private fun packageFor(activity: FollowUpActivity): DisciplinePackage =
        requireNotNull(catalog.find(activity.disciplineKey)).also {
            require(it.appliesTo(activity.kind))
        }

    private fun contributor(row: InformationEntity): InformationContributor =
        requireNotNull(
            catalog
                .find(row.disciplineKey, row.packageVersion)
                ?.informationContributors
                ?.singleOrNull {
                    it.information.key == row.ownerKey &&
                        it.information.version == row.definitionVersion
                }
        )

    private fun enabledContributors(
        pkg: DisciplinePackage,
        team: UUID,
    ): List<InformationContributor> {
        val settings = repository.settings(team).associateBy { it.capabilityKey }
        return pkg.informationContributors.filter { owner ->
            owner.information.capabilityKey?.let { key ->
                settings[key]?.enabled
                    ?: pkg.definition.capabilities.single { it.key == key }.enabledByDefault
            } ?: true
        }
    }

    private fun close(row: InformationEntity, reason: String, actor: Actor?) {
        check(repository.update(row.id, row.revision, row.valuesJson, "closed", reason) == 1)
        repository.history(
            UUID.randomUUID(),
            row.id,
            row.revision + 1,
            actor?.subject,
            actor?.let { directory.actorName(row.organizationId, it.subject) } ?: "System",
            access.now(),
            row.valuesJson,
            row.valuesJson,
            "closed",
            "{}",
        )
    }
}
