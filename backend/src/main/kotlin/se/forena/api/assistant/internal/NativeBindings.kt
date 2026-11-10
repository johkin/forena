package se.forena.api.assistant.internal

import org.springframework.aot.hint.annotation.RegisterReflectionForBinding
import org.springframework.aot.hint.RuntimeHints
import org.springframework.aot.hint.RuntimeHintsRegistrar
import org.springframework.aot.hint.MemberCategory
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.ImportRuntimeHints
import se.forena.api.assistant.Conversation
import se.forena.api.assistant.ConversationView
import se.forena.api.assistant.AssistantMessage
import se.forena.api.assistant.AssistantProposal
import se.forena.api.assistant.AssistantReply
import se.forena.api.assistant.AssistantProfile
import se.forena.api.assistant.SectionProfile
import se.forena.api.assistant.AssistantMemory
import se.forena.api.assistant.MemoryDraft
import se.forena.api.assistant.ResponseDraft
import se.forena.api.assistant.AttendanceDraft
import se.forena.api.assistant.PersonAttendance
import se.forena.api.assistant.ModelAnswer
import se.forena.api.assistant.AssistantTarget
import se.forena.api.assistant.RoutingPlan
import se.forena.api.assistant.AssistantDocument
import se.forena.api.assistant.AssistantDocuments
import se.forena.api.assistant.MemoryEdit
import se.forena.api.assistant.ConfirmationResult
import se.forena.api.assistant.ReminderDraft
import se.forena.api.assistant.AssistantReadTools
import se.forena.api.assistant.SharedActivityTools
import se.forena.api.assistant.ToolInvitations
import se.forena.api.assistant.ToolAttendance
import se.forena.api.assistant.ToolSignals
import se.forena.api.assistant.AssistantTeamSummary
import se.forena.api.assistant.AssistantEditorSummary

/** Typed JDBC projections and provider payloads are also reachable in the native runtime. */
@Configuration(proxyBeanMethods = false)
@ImportRuntimeHints(AssistantPromptResourceHints::class)
@RegisterReflectionForBinding(
    Conversation::class,
    ConversationView::class,
    AssistantMessage::class,
    AssistantProposal::class,
    AssistantReply::class,
    AssistantProfile::class,
    SectionProfile::class,
    AssistantMemory::class,
    MemoryDraft::class,
    ResponseDraft::class,
    AttendanceDraft::class,
    PersonAttendance::class,
    ModelAnswer::class,
    AssistantTarget::class,
    RoutingPlan::class,
    AssistantDocument::class,
    AssistantDocuments::class,
    MemoryEdit::class,
    ConfirmationResult::class,
    ReminderDraft::class,
    ToolInvitations::class,
    ToolAttendance::class,
    ToolSignals::class,
    AssistantTeamSummary::class,
    AssistantEditorSummary::class,
)
class AssistantNativeBindings

class AssistantPromptResourceHints : RuntimeHintsRegistrar {
    override fun registerHints(hints: RuntimeHints, classLoader: ClassLoader?) {
        hints.resources().registerPattern("prompts/*.md")
        hints.reflection().registerType(AssistantReadTools::class.java, MemberCategory.INVOKE_PUBLIC_METHODS)
        hints.reflection().registerType(SharedActivityTools::class.java, MemberCategory.INVOKE_PUBLIC_METHODS)
    }
}
