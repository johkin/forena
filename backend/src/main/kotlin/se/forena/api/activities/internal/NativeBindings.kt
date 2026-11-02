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
import se.forena.api.activities.ActivityCapacity
import se.forena.api.activities.DisciplinePlayer
import se.forena.api.activities.FollowUpActivity
import se.forena.api.activities.CapabilityPlayerCounts
import se.forena.api.activities.TeamReportPeriod
import se.forena.api.activities.DefaultsWorkspace
import se.forena.api.activities.DefaultsCommand

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
    ActivityCapacity::class,
    CapacityRow::class,
    FollowUpActivity::class, CapabilityPlayerCounts::class, TeamReportPeriod::class,
    DefaultsWorkspace::class, DefaultsCommand::class,
    DisciplinePlayer::class,
)
class ActivitiesNativeBindings
