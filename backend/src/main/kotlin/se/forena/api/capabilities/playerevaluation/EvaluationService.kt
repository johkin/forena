package se.forena.api.capabilities.playerevaluation

import java.util.UUID
import org.springframework.security.access.AccessDeniedException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional
import se.forena.api.activities.EvaluationAccess
import se.forena.api.capabilities.playerevaluation.internal.EvaluationRepository
import se.forena.api.extensionapi.*
import se.forena.api.identity.Actor

@Service
class EvaluationService(private val access: EvaluationAccess, private val repository: EvaluationRepository) : ReadViewContributor {
    override val definition = CapabilityDefinition("playerEvaluation", "1.0.0", "Spelarutvärdering", false, true)

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    fun snapshot(actor: Actor, team: UUID, activity: UUID? = null): EvaluationSnapshot {
        access.authorize(actor, team)
        val admin = access.administrator(actor, team)
        val settings = repository.settings(team) ?: return EvaluationSnapshot(false, admin, null)
        val facts = access.facts(actor, team, activity)
        val ids = facts.eligible.map { it.id }.toSet()
        return EvaluationSnapshot(true, admin, settings.revision, settings.defaultGroups, settings.threshold,
            repository.metrics(team), repository.scores(team).filter { it.personId in ids }, facts.eligible)
    }

    @Transactional
    fun configure(actor: Actor, team: UUID, command: EvaluationConfiguration): EvaluationSnapshot {
        access.lock(actor, team, configuring = true)
        require(definition.adjustable)
        val before = repository.settings(team)
        check(command.revision == before?.revision)
        if (!command.enabled) {
            require(command.confirmDeletion)
            repository.disable(team)
        } else {
            require(command.defaultGroups.isFinite() && command.defaultGroups % 1.0 == 0.0 && command.defaultGroups in 2.0..Int.MAX_VALUE.toDouble())
            require(command.threshold.isFinite() && command.threshold in 0.0..10.0)
            require(command.metrics.map { it.id }.distinct().size == command.metrics.size)
            require(command.metrics.all { it.name.trim().length in 1..100 })
            val old = repository.metrics(team)
            val removed = old.filter { prior -> command.metrics.none { it.id == prior.id } }
            require(removed.isEmpty() || command.confirmDeletion)
            repository.settings(team, command.defaultGroups.toInt(), command.threshold)
            removed.forEach { repository.deleteMetric(team, it.id) }
            command.metrics.forEach { repository.metric(team, it) }
        }
        return snapshot(actor, team)
    }

    @Transactional
    fun score(actor: Actor, team: UUID, activity: UUID?, command: EvaluationScoreCommand): EvaluationSnapshot {
        access.lock(actor, team)
        val settings = repository.settings(team) ?: throw AccessDeniedException("Capability disabled")
        check(command.revision == settings.revision)
        val eligible = access.facts(actor, team, activity).eligible.map { it.id }.toSet()
        val metrics = repository.metrics(team).map { it.id }.toSet()
        require(command.scores.map { it.personId to it.metricId }.distinct().size == command.scores.size)
        require(command.scores.all {
            it.personId in eligible && it.metricId in metrics && it.value.isFinite() && it.value in 0.0..10.0 && it.value % 1.0 == 0.0
        })
        command.scores.forEach { repository.score(team, it) }
        repository.settings(team, settings.defaultGroups, settings.threshold)
        return snapshot(actor, team, activity)
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    override fun contributions(actor: Actor, query: ReadViewQuery): List<ReadContribution> {
        val data = try { snapshot(actor, query.teamId, query.activityId) }
            catch (_: AccessDeniedException) { return emptyList() }
            catch (_: IllegalArgumentException) { return emptyList() } // Activity kind is not applicable.
        if (!data.enabled) return emptyList()
        require(query.mode in setOf("ability", "balanced"))
        val facts = access.facts(actor, query.teamId, query.activityId)
        require(query.activityId != null || query.personIds == null)
        val selected = query.personIds?.let { ids ->
            require(ids.distinct().size == ids.size && ids.all { id -> facts.eligible.any { it.id == id } })
            facts.eligible.filter { it.id in ids }
        } ?: facts.selected
        val assessed = Grouping.assess(selected, data.metrics, data.scores)
        val complete = assessed.count { it.ability != null }
        val count = query.groupCount ?: data.defaultGroups
        // Explicit invalid input is rejected. An unusable team default instead gets guidance.
        if (query.groupCount != null) require(count >= 2 && (complete < 2 || count <= complete))
        val mode = if (query.activityId == null) "ability" else query.mode
        val groups = if (count in 2..complete) Grouping.divide(assessed, count, mode) else emptyList()
        fun numeric(value: Double?) = if (value == null) ViewCell(CellType.missing) else ViewCell(CellType.number, number = value)
        fun row(player: AssessedPlayer, candidate: Boolean = false) = ViewRow(player.player.id.toString(),
            mapOf("name" to ViewCell(CellType.text, player.player.name), "ability" to numeric(player.ability), "development" to numeric(player.development)),
            if (candidate) listOf("Kan prova nästa förmågegrupp – ledaren beslutar") else emptyList())
        val views = mutableListOf<ReadView>()
        val groupColumns = listOf(ViewColumn("name", "Spelare"), ViewColumn("ability", "Förmåga"), ViewColumn("development", "Utveckling"))
        if (groups.isEmpty()) views.add(ReadView(ViewType.information, "Underlag saknas", message =
            "Ange minst en förmågemätpunkt och kompletta betyg för minst två spelare. Välj mellan två och $complete grupper utifrån antalet bedömbara spelare."))
        else views.add(ReadView(ViewType.groupedList, "Gruppförslag", columns = groupColumns, groups = groups.mapIndexed { index, group ->
            ViewGroup("group-$index", if (mode == "ability") "Förmågegrupp ${index + 1}" else "Lag ${index + 1}",
                "${group.size} spelare · Genomsnittlig förmåga ${"%.2f".format(java.util.Locale.forLanguageTag("sv-SE"), group.mapNotNull { it.ability }.average())}",
                group.map { row(it, mode == "ability" && index > 0 && it.development?.let { value -> value >= data.threshold } == true) })
        }))
        val missing = assessed.filter { it.ability == null }
        if (missing.isNotEmpty()) views.add(ReadView(ViewType.list, "Saknar bedömning – ledaren beslutar på plats", columns = groupColumns, rows = missing.map { row(it) }))
        if (query.activityId == null) {
            val scores = data.scores.associateBy { it.personId to it.metricId }
            views.add(ReadView(ViewType.table, "Aktuella spelarvärden", columns = groupColumns + data.metrics.map { ViewColumn(it.id.toString(), it.name) },
                rows = assessed.map { player -> row(player).copy(cells = row(player).cells + data.metrics.associate { metric ->
                    metric.id.toString() to numeric(scores[player.player.id to metric.id]?.value)
                }) }, message = "Medelvärden beräknas separat med lika vikt per typ. Alla betyg inom typen krävs. Utvecklingsvärdet påverkar aldrig placeringen. Högsta förmågegruppen visas först."))
        }
        val filters = mutableListOf(ViewFilter("groupCount", "Antal grupper", FilterType.integer, count.toString(), 2, complete.coerceAtLeast(2)))
        if (query.activityId != null) {
            filters.add(ViewFilter("mode", "Indelningssätt", FilterType.choice, mode, options = listOf(FieldOption("ability", "Grupper efter förmåga"), FieldOption("balanced", "Jämnstarka lag"))))
            filters.add(ViewFilter("personIds", "Spelare i förslaget", FilterType.people, options = facts.eligible.map { FieldOption(it.id.toString(), it.name) }, selected = selected.map { it.id.toString() }))
        }
        return listOf(ReadContribution("player-evaluation", definition.key, if (query.activityId == null) ViewPlacement.teamReport else ViewPlacement.activity,
            if (query.activityId == null) "Spelarutvärdering – dagens fördelning" else "Gruppförslag", filters = filters, views = views))
    }
}
