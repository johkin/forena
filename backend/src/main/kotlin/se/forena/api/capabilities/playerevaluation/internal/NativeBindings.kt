package se.forena.api.capabilities.playerevaluation.internal

import org.springframework.aot.hint.annotation.RegisterReflectionForBinding
import org.springframework.context.annotation.Configuration
import se.forena.api.capabilities.playerevaluation.*

@Configuration(proxyBeanMethods = false)
@RegisterReflectionForBinding(EvaluationSnapshot::class, EvaluationMetric::class, EvaluationScore::class,
    EvaluationConfiguration::class, EvaluationScoreCommand::class)
class PlayerEvaluationNativeBindings
