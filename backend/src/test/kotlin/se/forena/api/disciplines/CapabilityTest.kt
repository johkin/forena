package se.forena.api.disciplines

import java.time.Instant
import java.util.UUID
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import se.forena.api.capabilities.greencard.GreenCardCapability
import se.forena.api.capabilities.targetteamsize.TargetTeamSizeCapability
import se.forena.api.extensionapi.*
import tools.jackson.databind.json.JsonMapper

class CapabilityTest {
    private val json = JsonMapper.builder().build()
    private val now = Instant.parse("2030-10-25T10:00:00Z")
    private val rule = TargetTeamSizeCapability()
    private val context =
        CapabilityContext(
            UUID.randomUUID(),
            "Match",
            ActivityKind("match-tavling", "competition"),
            now.plusSeconds(20 * 3600),
            now,
            true,
            json.readTree("""{"targetTeamSize":10}"""),
            12,
            6,
            3,
            now.plusSeconds(3600),
            null,
            listOf(72, 24),
        )

    @Test
    fun `closest overdue checkpoint and timely actions are independent of transport`() {
        val result = rule.evaluate(context)
        assertThat(result.checkpoint).isEqualTo(24)
        assertThat(result.signal?.severity).isEqualTo("warning")
        assertThat(result.signal?.actions).contains("remind-unanswered", "invite-more-players")
        assertThat(rule.evaluate(context.copy(responseDueAt = now)).signal?.actions)
            .containsExactly("invite-more-players")
        assertThat(
                rule.evaluate(context.copy(lastReminderAt = now.minusSeconds(1800))).signal?.actions
            )
            .containsExactly("invite-more-players")
        assertThat(rule.evaluate(context.copy(acceptedPlayers = 10)).signal).isNull()
        assertThat(rule.evaluate(context.copy(invitedPlayers = 0)).nextEvaluationAt).isNull()
        assertThat(rule.evaluate(context.copy(eligible = false)).signal).isNull()
        assertThat(rule.evaluate(context.copy(startsAt = now)).signal).isNull()
    }

    @Test
    fun `green card keeps unknown distinct from none and accepts only distinct present players`() {
        val green = GreenCardCapability()
        val person = UUID.randomUUID()
        assertThat(green.complete(json.readTree("{}"))).isFalse()
        assertThat(green.complete(json.readTree("""{"outcome":"none"}"""))).isTrue()
        assertThat(green.complete(json.readTree("""{"outcome":"awarded"}"""))).isFalse()
        val values = json.readTree("""{"outcome":"awarded","recipientIds":["$person"]}""")
        green.validate(values, setOf(person))
        assertThat(green.complete(values)).isTrue()
        assertThatThrownBy { green.validate(values, emptySet()) }
            .isInstanceOf(IllegalArgumentException::class.java)
        assertThatThrownBy {
                green.validate(
                    json.readTree("""{"outcome":"awarded","recipientIds":["$person","$person"]}"""),
                    setOf(person),
                )
            }
            .isInstanceOf(IllegalArgumentException::class.java)
    }
}
