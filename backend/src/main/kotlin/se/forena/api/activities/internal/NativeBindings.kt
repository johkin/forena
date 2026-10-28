package se.forena.api.activities.internal

import org.springframework.aot.hint.annotation.RegisterReflectionForBinding
import org.springframework.context.annotation.Configuration
import se.forena.api.activities.AssistantInvitation
import se.forena.api.activities.AssistantRosterPerson
import se.forena.api.activities.AssistantTeamData
import se.forena.api.activities.HistoryPerson
import se.forena.api.activities.AssistantHistory
import se.forena.api.activities.HistorySummary
import se.forena.api.activities.DutyHistory
import se.forena.api.activities.InvitationChannelState
import se.forena.api.activities.ActivityDutyCommand
import se.forena.api.activities.DutyTarget
import se.forena.api.activities.DutyTargets
import se.forena.api.activities.AssistantMember
import se.forena.api.activities.AssistantMembers

/** Typed JDBC projections and provider payloads are also reachable in the native runtime. */
@Configuration(proxyBeanMethods = false)
@RegisterReflectionForBinding(
    AssistantInvitation::class,
    AssistantRosterPerson::class,
    AssistantTeamData::class,
    HistoryPerson::class,
    AssistantHistory::class,
    HistorySummary::class,
    DutyHistory::class,
    InvitationChannelState::class,
    ActivityDutyCommand::class,
    DutyTarget::class,
    DutyTargets::class,
    AssistantMember::class,
    AssistantMembers::class,
)
class ActivitiesNativeBindings
