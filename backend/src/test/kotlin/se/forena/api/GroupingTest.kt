package se.forena.api

import java.util.UUID
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import se.forena.api.activities.DisciplinePlayer
import se.forena.api.capabilities.playerevaluation.*

class GroupingTest {
    private fun player(index: Int, ability: Double?, development: Double? = null) =
        AssessedPlayer(DisciplinePlayer(UUID(0, index.toLong()), "Spelare $index"), ability, development)

    @Test fun `balanced teams minimize averages while ability groups remain contiguous`() {
        val players = listOf(9.0, 7.0, 5.0, 3.0).mapIndexed { index, score -> player(index, score) }
        val balanced = Grouping.divide(players, 2, "balanced")
        assertThat(balanced.map { it.mapNotNull { p -> p.ability }.average() }).containsExactly(6.0, 6.0)
        assertThat(Grouping.divide(players, 2, "ability").map { it.map { p -> p.ability } })
            .containsExactly(listOf(9.0, 7.0), listOf(5.0, 3.0))
    }

    @Test fun `twenty players form seven seven six with stable ties independent of indicators`() {
        val players = (1..20).map { player(it, (it / 3).toDouble(), it % 10.0) }
        for (count in listOf(2, 3, 4)) {
            val groups = Grouping.divide(players, count, "ability")
            assertThat(groups).hasSize(count)
            assertThat(groups.maxOf { it.size } - groups.minOf { it.size }).isLessThanOrEqualTo(1)
        }
        for (mode in listOf("ability", "balanced")) {
            val groups = Grouping.divide(players, 3, mode)
            assertThat(groups.map { it.size }).containsExactly(7, 7, 6)
            assertThat(groups.flatten().map { it.player.id }).doesNotHaveDuplicates().hasSize(20)
            assertThat(Grouping.divide(players.reversed(), 3, mode)).isEqualTo(groups)
            assertThat(Grouping.divide(players.map { it.copy(development = 10.0) }, 3, mode).map { it.map { p -> p.player.id } })
                .isEqualTo(groups.map { it.map { p -> p.player.id } })
        }
    }

    @Test fun `incomplete categories have no mean and zero is a valid score`() {
        val metrics = (1..5).map { EvaluationMetric(UUID(1, it.toLong()), "$it", if (it <= 3) MetricKind.ability else MetricKind.development) }
        val person = player(1, null).player
        val scores = listOf(6.0, 7.0, 8.0, 6.0, 8.0).mapIndexed { index, value -> EvaluationScore(person.id, metrics[index].id, value) }
        val result = Grouping.assess(listOf(person), metrics, scores).single()
        assertThat(result.ability).isEqualTo(7.0)
        assertThat(result.development).isEqualTo(7.0)
        assertThat(Grouping.assess(listOf(person), metrics, scores.dropLast(1)).single().development).isNull()
        assertThat(Grouping.assess(listOf(person), metrics, scores.drop(1)).single().ability).isNull()
        assertThat(Grouping.assess(listOf(person), metrics.take(1), listOf(scores.first().copy(value = 0.0))).single().ability).isEqualTo(0.0)
        assertThat(Grouping.assess(listOf(person), emptyList(), scores).single().ability).isNull()
    }

    @Test fun `only assessed players count and invalid counts are rejected`() {
        val players = (1..8).map { player(it, if (it <= 6) it.toDouble() else null) }
        assertThat(Grouping.divide(players, 3, "ability").map { it.size }).containsExactly(2, 2, 2)
        for (count in listOf(1, 7)) assertThatThrownBy { Grouping.divide(players, count, "ability") }.isInstanceOf(IllegalArgumentException::class.java)
    }
}
