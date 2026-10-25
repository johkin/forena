package se.forena.api.activities

import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.util.UUID
import java.time.ZoneId
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test

class ActivityTimesTest {
    private val stockholm = ZoneId.of("Europe/Stockholm")

    @Test fun `calendar days and elapsed hours differ across DST`() {
        val start = Instant.parse("2030-10-28T17:00:00Z")
        assertThat(ActivityTimes.evaluate("start-6d", "start", start, stockholm)).isEqualTo(Instant.parse("2030-10-22T16:00:00Z"))
        assertThat(ActivityTimes.evaluate("start-144h", "start", start, stockholm)).isEqualTo(Instant.parse("2030-10-22T17:00:00Z"))
        assertThat(ActivityTimes.evaluate("start-1d/d", "start", start, stockholm)).isEqualTo(Instant.parse("2030-10-26T22:00:00Z"))
    }
    @Test fun `bounded syntax rejects arbitrary expressions overflow and excessive duration`() {
        for (rule in listOf("now", "start+1h", "start-1w", "deadline-2h", "start-999999d", "start-1h-1h-1h-1h-1h")) {
            assertThatThrownBy { ActivityTimes.evaluate(rule, "start", Instant.now(), stockholm) }.isInstanceOf(IllegalArgumentException::class.java)
        }
        for (duration in listOf("PT", "PT0M", "PT10081M", "P1D", "PT1.5H")) {
            assertThatThrownBy { ActivityTimes.minutes(duration) }.isInstanceOf(IllegalArgumentException::class.java)
        }
    }
    @Test fun `past invitation becomes due now and expired reminders are omitted`() {
        val command = ActivityCommand(title="Match", startsAt=Instant.parse("2030-10-25T16:00:00Z"), endsAt=Instant.parse("2030-10-25T17:00:00Z"))
        val now = Instant.parse("2030-10-25T09:00:00Z")
        val (deadline, schedule) = ActivityTimes.schedule(command, stockholm, now)
        assertThat(deadline).isEqualTo(Instant.parse("2030-10-25T10:00:00Z"))
        assertThat(schedule).containsExactly(now)
    }
    private fun series() = ActivitySeriesCommand(
        teamId = UUID.randomUUID(), title = "Veckoträning",
        startsOn = LocalDate.parse("2030-10-21"), endsOn = LocalDate.parse("2030-11-04"),
        startTime = LocalTime.parse("18:00"), timeZone = "Europe/Stockholm",
        weekdays = listOf(1), timingRules = ActivityTimingRules(duration = "PT1H", gatheringRule = "start-15m"))

    @Test fun `weekly series keeps local start time over DST with independent gathering and duration`() {
        val occurrences = ActivityTimes.weekly(series(), stockholm)
        assertThat(occurrences.map { it.startsAt }).containsExactly(
            Instant.parse("2030-10-21T16:00:00Z"), Instant.parse("2030-10-28T17:00:00Z"), Instant.parse("2030-11-04T17:00:00Z"))
        assertThat(occurrences).allSatisfy {
            assertThat(it.endsAt).isEqualTo(it.startsAt.plusSeconds(3600))
            assertThat(it.gatheringAt).isEqualTo(it.startsAt.minusSeconds(900))
        }
    }

    @Test fun `weekly series rejects invalid bounds weekdays excessive counts and nonexistent local start`() {
        val base = series()
        for (invalid in listOf(
            base.copy(weekdays = emptyList()), base.copy(weekdays = listOf(0)),
            base.copy(endsOn = base.startsOn.minusDays(1)), base.copy(endsOn = base.startsOn.plusDays(367)),
            base.copy(endsOn = base.startsOn.plusDays(120), weekdays = (1..7).toList()),
            base.copy(startsOn = LocalDate.parse("2030-03-31"), endsOn = LocalDate.parse("2030-03-31"),
                weekdays = listOf(7), startTime = LocalTime.parse("02:30"))
        )) assertThatThrownBy { ActivityTimes.weekly(invalid, stockholm) }.isInstanceOf(IllegalArgumentException::class.java)
    }

}
