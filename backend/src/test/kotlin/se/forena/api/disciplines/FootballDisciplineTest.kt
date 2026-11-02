package se.forena.api.disciplines

import java.util.UUID
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import se.forena.api.capabilities.greencard.GreenCardCapability
import se.forena.api.capabilities.targetteamsize.TargetTeamSizeCapability
import se.forena.api.disciplines.common.CommonDiscipline
import se.forena.api.disciplines.football.FootballDiscipline
import se.forena.api.extensionapi.*
import se.forena.api.extensions.DisciplineRegistry
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper

class FootballDisciplineTest {
    private val football = FootballDiscipline(TargetTeamSizeCapability(), GreenCardCapability())
    private val json = JsonMapper.builder().build()
    private val match = ActivityKind("match-tavling", "competition")

    @Test
    fun `football is a selectable package and unknown keys and versions have no fallback`() {
        val registry: DisciplineCatalog = DisciplineRegistry(listOf(CommonDiscipline(), football))
        assertThat(registry.definitions().map { it.key })
            .containsExactlyInAnyOrder("common", "football")
        assertThat(registry.find("football", "1.0.0")).isSameAs(football)
        assertThat(registry.find("football", "2.0.0")).isNull()
        assertThat(registry.find("choir")).isNull()
        assertThatThrownBy { DisciplineRegistry(listOf(football, football)) }
            .isInstanceOf(IllegalArgumentException::class.java)
    }

    @Test
    fun `a retained package version is readable without becoming selectable or changing historical meaning`() {
        val retained =
            object : DisciplinePackage by football {
                override val definition = football.definition.copy(version = "0.9.0")
                override val selectable = false
            }
        val catalog: DisciplineCatalog = DisciplineRegistry(listOf(football, retained))
        assertThat(catalog.find("football")).isSameAs(football)
        assertThat(catalog.find("football", "0.9.0")).isSameAs(retained)
        assertThat(catalog.definitions().map { it.version }).containsExactly("1.0.0")
    }

    @Test
    fun `different packages compose the same capability implementation through the shared interface`() {
        val capability: ActivityCapability = TargetTeamSizeCapability()
        val second =
            object : DisciplinePackage {
                override val definition =
                    DisciplineDefinition(
                        "test-discipline",
                        "1.0.0",
                        "Test",
                        "sport",
                        mapOf(DisciplineScope.team to capability.fields(DisciplineScope.team)),
                    )

                override fun appliesTo(kind: ActivityKind) = kind.slug == "test-match"

                override fun validate(
                    scope: DisciplineScope,
                    values: JsonNode,
                    context: DisciplineValidationContext,
                ) = capability.validate(scope, values)

                override fun initialActivityValues(teamValues: JsonNode) = teamValues.deepCopy()
            }
        val first = FootballDiscipline(capability, GreenCardCapability())
        val catalog: DisciplineCatalog = DisciplineRegistry(listOf(first, second))
        val valid = json.readTree("""{"targetTeamSize":10}""")
        for (key in listOf("football", "test-discipline")) {
            requireNotNull(catalog.find(key))
                .validate(DisciplineScope.team, valid, DisciplineValidationContext())
            assertThatThrownBy {
                    requireNotNull(catalog.find(key))
                        .validate(
                            DisciplineScope.team,
                            json.readTree("""{"targetTeamSize":0}"""),
                            DisciplineValidationContext(),
                        )
                }
                .isInstanceOf(IllegalArgumentException::class.java)
        }
        assertThat(first.appliesTo(match)).isTrue()
        assertThat(second.appliesTo(match)).isFalse()
    }

    @Test
    fun `only the explicit match type enables football fields`() {
        assertThat(football.appliesTo(match)).isTrue()
        assertThat(football.appliesTo(ActivityKind("cup", "competition"))).isFalse()
        assertThat(football.appliesTo(ActivityKind("match-tavling", "session"))).isFalse()
    }

    @Test
    fun `planning validates squad size independently of players on pitch`() {
        football.validate(
            DisciplineScope.team,
            json.readTree("""{"gameFormat":"7v7","targetTeamSize":10,"requiredGoalkeepers":2}"""),
            DisciplineValidationContext(),
        )
        for (values in
            listOf(
                """{"targetTeamSize":0}""",
                """{"targetTeamSize":1.5}""",
                """{"gameFormat":"7v7","targetTeamSize":6}""",
                """{"targetTeamSize":2,"requiredGoalkeepers":3}""",
                """{"shirtNumber":7}""",
                """{"periodMinutes":121}""",
            )) {
            assertThatThrownBy {
                    football.validate(
                        DisciplineScope.team,
                        json.readTree(values),
                        DisciplineValidationContext(),
                    )
                }
                .isInstanceOf(IllegalArgumentException::class.java)
        }
    }

    @Test
    fun `membership properties reject unknown duplicate and out of range values`() {
        football.validate(
            DisciplineScope.teamMembership,
            json.readTree("""{"shirtNumber":0,"positions":["goalkeeper","forward"]}"""),
            DisciplineValidationContext(),
        )
        for (values in
            listOf(
                """{"shirtNumber":1000}""",
                """{"positions":["forward","forward"]}""",
                """{"positions":["captain"]}""",
            )) assertThatThrownBy {
                football.validate(
                    DisciplineScope.teamMembership,
                    json.readTree(values),
                    DisciplineValidationContext(),
                )
            }
            .isInstanceOf(IllegalArgumentException::class.java)
    }

    @Test
    fun `captain requires server supplied candidates and never widens an empty selection`() {
        val player = UUID.randomUUID()
        val values = json.readTree("""{"captainPersonId":"$player"}""")
        assertThatThrownBy {
                football.validate(
                    DisciplineScope.activity,
                    values,
                    DisciplineValidationContext(match, setOf(player)),
                )
            }
            .isInstanceOf(IllegalArgumentException::class.java)
        football.validate(
            DisciplineScope.activity,
            values,
            DisciplineValidationContext(match, acceptedPlayerIds = setOf(player)),
        )
        assertThatThrownBy {
                football.validate(
                    DisciplineScope.activity,
                    values,
                    DisciplineValidationContext(
                        ActivityKind("training", "session"),
                        acceptedPlayerIds = setOf(player),
                    ),
                )
            }
            .isInstanceOf(IllegalArgumentException::class.java)
    }

    @Test
    fun `activity snapshot has only explicit team planning and no guessed defaults`() {
        val source = json.readTree("""{"gameFormat":"7v7","targetTeamSize":10}""")
        val snapshot = football.initialActivityValues(source)
        assertThat(snapshot).isEqualTo(source)
        assertThat(football.initialActivityValues(json.createObjectNode()).isEmpty).isTrue()
        assertThat(
                football.definition.fields.getValue(DisciplineScope.teamMembership).all {
                    it.read == FieldAudience.team
                }
            )
            .isTrue()
        assertThat(
                football.definition.fields
                    .getValue(DisciplineScope.activity)
                    .single { it.key == "captainPersonId" }
                    .read
            )
            .isEqualTo(FieldAudience.invitations)
    }
}
