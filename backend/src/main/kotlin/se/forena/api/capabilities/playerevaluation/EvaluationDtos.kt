package se.forena.api.capabilities.playerevaluation

import java.util.UUID
import se.forena.api.activities.DisciplinePlayer

enum class MetricKind { ability, development }
data class EvaluationMetric(val id: UUID, val name: String, val kind: MetricKind)
data class EvaluationScore(val personId: UUID, val metricId: UUID, val value: Double)
data class EvaluationSnapshot(
    val enabled: Boolean, val canConfigure: Boolean, val revision: UUID?,
    val defaultGroups: Int = 2, val threshold: Double = 7.0,
    val metrics: List<EvaluationMetric> = emptyList(), val scores: List<EvaluationScore> = emptyList(),
    val players: List<DisciplinePlayer> = emptyList(),
)
data class EvaluationConfiguration(
    val revision: UUID?, val enabled: Boolean, val confirmDeletion: Boolean = false,
    val defaultGroups: Double = 2.0, val threshold: Double = 7.0,
    val metrics: List<EvaluationMetric> = emptyList(),
)
data class EvaluationScoreCommand(val revision: UUID, val scores: List<EvaluationScore>)
