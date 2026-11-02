package se.forena.api.extensions.internal

import org.springframework.aot.hint.annotation.RegisterReflectionForBinding
import org.springframework.context.annotation.Configuration
import se.forena.api.activities.DisciplinePlayer
import se.forena.api.extensionapi.*
import se.forena.api.extensions.*

@Configuration(proxyBeanMethods = false)
@RegisterReflectionForBinding(
    DisciplineValueEntity::class,
    DisciplineFieldsCommand::class,
    DisciplineFieldsSnapshot::class,
    DisciplineDefinition::class,
    DisciplineField::class,
    FieldOption::class,
    FieldCondition::class,
    CapabilityDefinition::class,
    DisciplinePlayer::class,
    InformationEntity::class,
    InformationHistoryRow::class,
    CapabilitySettingRow::class,
    InformationJobRow::class,
    InformationCommand::class,
    InformationSnapshot::class,
    InformationDefinition::class,
    InformationAnswer::class,
    InformationItem::class,
    InformationHistory::class,
    InformationReport::class,
    InformationPeriodReport::class,
    InformationReportEntry::class,
    PendingInformation::class,
    CapabilitySetting::class,
    CapabilityChange::class,
    DisciplineCatalogueEntity::class,
    DisciplineCategoryEntity::class,
    CatalogueSnapshot::class,
    CatalogueDiscipline::class,
    CatalogueCategory::class,
    CatalogueChange::class,
    ActivityCapabilityEntity::class,
    CapabilityEvaluationRow::class,
    CapabilitySignalEntity::class,
    SignalActionRow::class,
    SignalSnapshot::class,
    SignalAction::class,
    SignalCommand::class,
)
class NativeBindings
