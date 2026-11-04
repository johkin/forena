package se.forena.api.capabilities.playerevaluation

import java.util.UUID
import kotlin.math.abs
import se.forena.api.activities.DisciplinePlayer

data class AssessedPlayer(val player: DisciplinePlayer, val ability: Double?, val development: Double?)

/** Pure, deterministic calculations shared by activity and report. No persisted suggestions. */
object Grouping {
    fun assess(players: List<DisciplinePlayer>, metrics: List<EvaluationMetric>, scores: List<EvaluationScore>): List<AssessedPlayer> {
        val values = scores.associateBy { it.personId to it.metricId }
        fun mean(person: UUID, kind: MetricKind): Double? {
            val required = metrics.filter { it.kind == kind }
            if (required.isEmpty()) return null
            val ratings = required.map { values[person to it.id]?.value ?: return null }
            return ratings.average()
        }
        return players.map { AssessedPlayer(it, mean(it.id, MetricKind.ability), mean(it.id, MetricKind.development)) }
    }

    fun divide(players: List<AssessedPlayer>, count: Int, mode: String): List<List<AssessedPlayer>> {
        require(mode in setOf("ability", "balanced"))
        val sorted = players.filter { it.ability != null }
            .sortedWith(compareByDescending<AssessedPlayer> { it.ability }.thenBy { it.player.id })
        require(count in 2..sorted.size)
        val sizes = List(count) { sorted.size / count + if (it < sorted.size % count) 1 else 0 }
        if (mode == "ability") {
            var offset = 0
            return sizes.map { size -> sorted.subList(offset, offset + size).also { offset += size } }
        }
        // Seed by lowest normalized sum, then exchange pairs while average variance decreases.
        // Fixed sizes and strict improvements guarantee termination and stable ties.
        val groups = List(count) { mutableListOf<AssessedPlayer>() }
        sorted.forEachIndexed { index, player ->
            val candidates = groups.indices.filter { groups[it].size < sizes[it] }
            val next = candidates.minWith(compareBy<Int> {
                groups[it].sumOf { p -> requireNotNull(p.ability) } / sizes[it]
            }.thenBy { it })
            groups[next].add(player)
        }
        val sums = groups.map { group -> group.sumOf { requireNotNull(it.ability) } }.toMutableList()
        val target = sorted.sumOf { requireNotNull(it.ability) } / sorted.size
        fun loss(sum: Double, index: Int): Double = (sum / sizes[index] - target).let { it * it }
        repeat(100) {
            var improved = false
            for (a in groups.indices) for (b in a + 1 until count) {
                for (i in groups[a].indices) for (j in groups[b].indices) {
                    val delta = requireNotNull(groups[b][j].ability) - requireNotNull(groups[a][i].ability)
                    val before = loss(sums[a], a) + loss(sums[b], b)
                    val after = loss(sums[a] + delta, a) + loss(sums[b] - delta, b)
                    if (before - after > 1e-10 && abs(delta) > 1e-10) {
                        val old = groups[a][i]; groups[a][i] = groups[b][j]; groups[b][j] = old
                        sums[a] += delta; sums[b] -= delta
                        improved = true
                    }
                }
            }
            if (!improved) return groups
        }
        return groups
    }
}
