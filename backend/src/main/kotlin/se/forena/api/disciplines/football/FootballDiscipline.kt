package se.forena.api.disciplines.football

import java.util.UUID
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.stereotype.Component
import se.forena.api.extensionapi.*
import tools.jackson.databind.JsonNode
import tools.jackson.databind.node.JsonNodeFactory

@Component
class FootballDiscipline(
    @Qualifier("targetTeamSize") private val squad: ActivityCapability,
    @Qualifier("greenCard") private val greenCard: InformationCapability,
) : DisciplinePackage {
    override val activityCapabilities = listOf(squad)
    override val informationContributors = listOf(CaptainInformation(), greenCard)
    private val formats = listOf(3, 5, 7, 9, 11).map { FieldOption("${it}v$it", "$it mot $it") }
    private val positions =
        listOf(
            FieldOption("goalkeeper", "Målvakt"),
            FieldOption("defender", "Back"),
            FieldOption("midfielder", "Mittfältare"),
            FieldOption("forward", "Anfallare"),
        )
    private val planning =
        listOf(
            DisciplineField("gameFormat", "Spelform", FieldType.choice, options = formats),
            *squad.fields(DisciplineScope.team).toTypedArray(),
            DisciplineField(
                "requiredGoalkeepers",
                "Önskat antal målvakter",
                FieldType.integer,
                minimum = 0,
                maximum = 10,
            ),
            DisciplineField(
                "periods",
                "Antal perioder",
                FieldType.integer,
                minimum = 1,
                maximum = 10,
            ),
            DisciplineField(
                "periodMinutes",
                "Minuter per period",
                FieldType.integer,
                minimum = 1,
                maximum = 120,
            ),
        )
    private val shirt =
        DisciplineField(
            "shirtNumber",
            "Tröjnummer",
            FieldType.integer,
            read = FieldAudience.team,
            minimum = 0,
            maximum = 999,
        )
    override val definition =
        DisciplineDefinition(
            "football",
            "1.0.0",
            "Fotboll",
            "sport",
            mapOf(
                DisciplineScope.section to emptyList(),
                DisciplineScope.team to planning,
                DisciplineScope.teamMembership to
                    listOf(
                        shirt,
                        DisciplineField(
                            "positions",
                            "Positioner",
                            FieldType.choices,
                            read = FieldAudience.team,
                            options = positions,
                        ),
                    ),
                DisciplineScope.activity to
                    planning +
                        listOf(
                            DisciplineField(
                                "venue",
                                "Hemma/borta",
                                FieldType.choice,
                                options =
                                    listOf(
                                        FieldOption("home", "Hemma"),
                                        FieldOption("away", "Borta"),
                                        FieldOption("neutral", "Neutral plan"),
                                    ),
                            ),
                            DisciplineField(
                                "captainSource",
                                "Spelarurval för lagkapten",
                                FieldType.choice,
                                read = FieldAudience.invitations,
                                write = FieldAudience.invitations,
                                options =
                                    listOf(
                                        FieldOption(
                                            "acceptedActivityPlayers",
                                            "Anmälda spelare till matchen",
                                        ),
                                        FieldOption("teamPlayers", "Lagets spelare"),
                                    ),
                            ),
                            DisciplineField(
                                "captainPersonId",
                                "Lagkapten",
                                FieldType.player,
                                read = FieldAudience.invitations,
                                write = FieldAudience.invitations,
                            ),
                        ),
                DisciplineScope.activityParticipation to
                    listOf(
                        shirt.copy(
                            read = FieldAudience.invitations,
                            write = FieldAudience.invitations,
                        ),
                        DisciplineField(
                            "position",
                            "Position i matchen",
                            FieldType.choice,
                            read = FieldAudience.invitations,
                            write = FieldAudience.invitations,
                            options = positions,
                        ),
                    ),
            ),
            capabilities = listOf(squad.definition, greenCard.definition),
            scopeTitles =
                mapOf(
                    DisciplineScope.team to "Matchförval",
                    DisciplineScope.teamMembership to "Spelaruppgifter",
                    DisciplineScope.activity to "Matchuppgifter",
                    DisciplineScope.activityParticipation to "Spelarens matchuppgifter",
                ),
        )

    override fun appliesTo(kind: ActivityKind) =
        kind.slug == "match-tavling" && kind.category == "competition"

    override fun validate(
        scope: DisciplineScope,
        values: JsonNode,
        context: DisciplineValidationContext,
    ) {
        DisciplineValidation.validate(definition.fields[scope].orEmpty(), values)
        squad.validate(scope, values)
        if (scope in setOf(DisciplineScope.activity, DisciplineScope.activityParticipation))
            require(context.activityKind?.let(::appliesTo) == true)
        val size = values.get("targetTeamSize")?.intValue()
        val goalkeepers = values.get("requiredGoalkeepers")?.intValue()
        require(size == null || goalkeepers == null || goalkeepers <= size)
        val format = values.get("gameFormat")?.stringValue()?.substringBefore('v')?.toInt()
        require(size == null || format == null || size >= format)
        values.get("captainPersonId")?.let { captain ->
            val source = values.get("captainSource")?.stringValue() ?: "acceptedActivityPlayers"
            val candidates =
                if (source == "teamPlayers") context.teamPlayerIds else context.acceptedPlayerIds
            require(UUID.fromString(captain.stringValue()) in candidates)
        }
    }

    override fun initialActivityValues(teamValues: JsonNode): JsonNode =
        JsonNodeFactory.instance.objectNode().also { result ->
            planning.forEach { field ->
                teamValues.get(field.key)?.let { result.set(field.key, it) }
            }
        }
}
