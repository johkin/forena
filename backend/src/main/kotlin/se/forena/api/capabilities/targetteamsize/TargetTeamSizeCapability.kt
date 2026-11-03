package se.forena.api.capabilities.targetteamsize

import org.springframework.stereotype.Component
import se.forena.api.extensionapi.*
import tools.jackson.databind.JsonNode

/** Shared squad target; this is separate from the core's hard participant limit. */
@Component("targetTeamSize")
class TargetTeamSizeCapability : ActivityCapability {
    override val definition =
        CapabilityDefinition(
            "targetTeamSize",
            "1.0.0",
            "Önskad matchtrupp",
            false,
            true,
            "activityDefaults",
        )
    override val defaultHours = listOf(72, 24)

    override fun evaluate(context: CapabilityContext): CapabilityEvaluation {
        val target =
            context.values
                .get("targetTeamSize")
                ?.takeIf {
                    it.isIntegralNumber && it.canConvertToInt() && it.intValue() in 1..100
                }
                ?.intValue()
        if (
            !context.eligible ||
                target == null ||
                context.invitedPlayers == 0 ||
                context.startsAt <= context.evaluatedAt
        )
            return CapabilityEvaluation(null, null)
        val times = context.hours.map { context.startsAt.minusSeconds(it * 3600L) }
        val due =
            context.hours
                .filter { context.startsAt.minusSeconds(it * 3600L) <= context.evaluatedAt }
                .minOrNull()
        val shortage = context.acceptedPlayers < target && due != null
        val deadlinePassed = context.responseDueAt?.let { it <= context.evaluatedAt } == true
        val canRemind =
            context.pendingPlayers > 0 &&
                !deadlinePassed &&
                (context.lastReminderAt == null ||
                    context.lastReminderAt.plusSeconds(3600) <= context.evaluatedAt)
        val text =
            "${context.acceptedPlayers} av önskade $target spelare har tackat ja. ${context.pendingPlayers} spelare har ännu inte svarat."
        val signal =
            if (shortage)
                CapabilitySignal(
                    "team_size_shortage",
                    if (context.startsAt.minusSeconds(86400) <= context.evaluatedAt) "warning"
                    else "info",
                    "Få spelare anmälda till matchen",
                    text,
                    (if (canRemind) listOf("remind-unanswered") else emptyList()) +
                        "invite-more-players",
                )
            else null
        val candidates =
            times +
                if (shortage)
                    listOfNotNull(
                        context.startsAt,
                        context.startsAt.minusSeconds(86400),
                        context.responseDueAt,
                        context.lastReminderAt?.plusSeconds(3600),
                    )
                else emptyList()
        val next =
            candidates.filter { it > context.evaluatedAt && it <= context.startsAt }.minOrNull()
        val action =
            if (context.pendingPlayers > 0 && !deadlinePassed)
                "Öppna matchen i Förena för att påminna obesvarade eller kalla fler spelare."
            else "Öppna matchen i Förena för att kalla fler spelare."
        return CapabilityEvaluation(
            signal,
            next,
            if (shortage) due else null,
            if (shortage) "Matchtruppen behöver fler spelare: ${context.title}" else null,
            if (shortage) "$text $action" else null,
        )
    }

    private val field =
        DisciplineField(
            "targetTeamSize",
            "Önskad matchtrupp",
            FieldType.integer,
            minimum = 1,
            maximum = 100,
        )

    override fun fields(scope: DisciplineScope) =
        if (scope == DisciplineScope.team || scope == DisciplineScope.activity) listOf(field)
        else emptyList()

    override fun validate(scope: DisciplineScope, values: JsonNode) {
        values.get(field.key)?.let { value ->
            require(fields(scope).isNotEmpty())
            require(value.isIntegralNumber && value.canConvertToInt() && value.intValue() in 1..100)
        }
    }
}
