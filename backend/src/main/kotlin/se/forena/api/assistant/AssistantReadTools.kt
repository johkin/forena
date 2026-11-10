package se.forena.api.assistant

import java.time.LocalDate
import java.util.UUID
import org.springframework.ai.chat.model.ToolContext
import org.springframework.ai.tool.annotation.Tool
import org.springframework.ai.tool.annotation.ToolParam
import org.springframework.stereotype.Service
import se.forena.api.activities.ActivityDutyService
import se.forena.api.activities.AssistantActivityService
import se.forena.api.activities.AssistantHistory
import se.forena.api.activities.AssistantMemberService
import se.forena.api.activities.AssistantMembers
import se.forena.api.activities.AssistantTeamData
import se.forena.api.activities.AttendanceService
import se.forena.api.activities.DutyTargets
import se.forena.api.activities.PersonalActivity
import se.forena.api.extensions.CapabilityRuntime

/** Detailed application reads shared by the assistant and MCP, subject to domain permissions. */
@Service
class AssistantReadTools(
    private val activities: AssistantActivityService,
    private val resources: AssistantToolAccessService,
    private val attendance: AttendanceService,
    private val members: AssistantMemberService,
    private val documents: AssistantDocumentService,
    private val duties: ActivityDutyService,
    private val signals: CapabilityRuntime,
) {
    @Tool(name = "get_team_context", description = "Läs lagets behöriga redigeringsunderlag och trupp med person-id när ett förslag behöver dem. Hämtar inga kontaktuppgifter och utför inga ändringar.")
    fun teamContext(teamId: UUID, context: ToolContext): AssistantTeamData =
        resources.team(AssistantToolScope.from(context), teamId)

    @Tool(name = "get_activity_details", description = "Läs en aktivitets behöriga detaljer och egna kallelser. Använd ett aktivitets-id från underlaget.")
    fun activity(activityId: UUID, context: ToolContext): PersonalActivity =
        resources.activity(AssistantToolScope.from(context), activityId)

    @Tool(name = "get_activity_invitations", description = "Läs aktuella kallelsesvar för en aktivitet. Underlaget anger om svaren gäller hela aktiviteten eller bara egna personer.")
    fun invitations(activityId: UUID, context: ToolContext): ToolInvitations {
        val scope = AssistantToolScope.from(context)
        val selected = resources.activity(scope, activityId)
        val team = resources.team(scope, selected.team.id)
        val rows = activities.invitations(scope.actor, activityId)
        return ToolInvitations(
            rows.take(200),
            rows.groupingBy { it.response }.eachCount(),
            if (team.invitationAccess) "whole_activity" else "visible_people_only",
            rows.size > 200,
        )
    }

    @Tool(name = "get_activity_attendance", description = "Läs närvarolista inför närvarofrågor eller ett närvaroförslag. Kräver rätt att hantera närvaro. Kallelsesvar är inte faktisk närvaro.")
    fun attendance(activityId: UUID, context: ToolContext): ToolAttendance {
        val scope = AssistantToolScope.from(context)
        resources.activity(scope, activityId)
        val snapshot = attendance.snapshot(scope.actor, activityId)
        // Report history and suggested extra people are unnecessary for interpreting current attendance.
        return ToolAttendance(snapshot.revision, snapshot.status, snapshot.writable, snapshot.roster)
    }

    @Tool(name = "get_activity_history", description = "Läs lagets närvaro- och arbetshistorik inom en period, högst 366 kalenderdagar. Datum skrivs YYYY-MM-DD. Okänd närvaro får inte räknas som frånvaro.")
    fun history(teamId: UUID, from: LocalDate, through: LocalDate, context: ToolContext): AssistantHistory {
        val scope = AssistantToolScope.from(context)
        val team = resources.team(scope, teamId)
        return activities.history(scope.actor, team.teamId, from, through)
    }

    @Tool(name = "get_assistant_documents", description = "Läs klubbens tillämpliga dokument när frågan behöver dokumentunderlag. Lag-id begränsar till det lagets klubb och sektion.")
    fun documents(
        organizationId: UUID,
        @ToolParam(required = false) teamId: UUID?,
        context: ToolContext,
    ): AssistantDocuments {
        val scope = AssistantToolScope.from(context)
        val selected = resources.teamInOrganization(scope, organizationId, teamId)
        return documents.read(scope.actor, organizationId, selected?.teamId, selected?.sectionId)
    }

    @Tool(name = "get_member_assignments", description = "Läs behöriga medlemsantal, roller och uppdrag i klubben eller laget. Kräver aktuell rätt att hantera medlemmarna och innehåller inga kontaktuppgifter.")
    fun members(
        organizationId: UUID,
        @ToolParam(required = false) teamId: UUID?,
        context: ToolContext,
    ): AssistantMembers? {
        val scope = AssistantToolScope.from(context)
        val selected = resources.teamInOrganization(scope, organizationId, teamId)
        return members.read(scope.actor, organizationId, selected?.teamId, selected?.sectionId)
    }

    @Tool(name = "get_duty_targets", description = "Läs möjliga aktiviteter inför ett granskbart arbetspassförslag. Kräver kallelsehantering. Sparar eller skickar inget; använd högst 100 aktiviteter och respektera truncated.")
    fun dutyTargets(teamId: UUID, context: ToolContext): DutyTargets {
        val scope = AssistantToolScope.from(context)
        val team = resources.team(scope, teamId)
        return duties.targets(scope.actor, team.teamId)
    }

    @Tool(name = "get_capability_signals", description = "Läs lagets aktiva verksamhetssignaler när frågan gäller uppföljning eller rekommendationer. Kräver aktuell signalåtkomst. Utför inga åtgärder.")
    fun capabilitySignals(teamId: UUID, context: ToolContext): ToolSignals {
        val scope = AssistantToolScope.from(context)
        val selected = resources.team(scope, teamId)
        val active = signals.list(scope.actor, selected.teamId)
            .filter { it.state == "active" }
        return ToolSignals(active.take(100), active.size > 100)
    }
}
