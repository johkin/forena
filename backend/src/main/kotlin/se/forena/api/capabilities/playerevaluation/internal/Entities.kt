package se.forena.api.capabilities.playerevaluation.internal

import java.util.UUID

data class EvaluationSettings(val revision: UUID, val defaultGroups: Int, val threshold: Double)
