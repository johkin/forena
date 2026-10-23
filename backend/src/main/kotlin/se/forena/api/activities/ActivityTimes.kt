package se.forena.api.activities

import java.time.Duration
import java.time.Instant
import java.time.ZoneId

/** Same bounded grammar and DST semantics as activity-time-rules.ts. */
object ActivityTimes {
    private val grammar = Regex("^(start|deadline)((?:-[0-9]{1,6}[dhm]){0,4})(/d)?$")
    private val offset = Regex("-([0-9]{1,6})([dhm])")
    private val duration = Regex("^PT(?:(\\d+)H)?(?:(\\d+)M)?$")

    fun minutes(value: String): Long {
        val match = requireNotNull(duration.matchEntire(value))
        require(match.groupValues[1].isNotEmpty() || match.groupValues[2].isNotEmpty())
        val hours = if (match.groupValues[1].isEmpty()) 0 else requireNotNull(match.groupValues[1].toLongOrNull())
        val minutes = if (match.groupValues[2].isEmpty()) 0 else requireNotNull(match.groupValues[2].toLongOrNull())
        require(hours in 0..168 && minutes in 0..10080)
        val total = hours * 60 + minutes
        require(total in 1..10080)
        return total
    }

    fun evaluate(rule: String, anchor: String, instant: Instant, zone: ZoneId): Instant {
        require(rule.length <= 80)
        val match = requireNotNull(grammar.matchEntire(rule))
        require(match.groupValues[1] == anchor)
        var current = instant
        var nominalMinutes = 0L
        for (part in offset.findAll(match.groupValues[2])) {
            val amount = part.groupValues[1].toLong()
            val unit = part.groupValues[2]
            nominalMinutes += amount * when (unit) { "d" -> 1440; "h" -> 60; else -> 1 }
            require(nominalMinutes <= 366 * 1440)
            current = when (unit) {
                // Re-resolve local time to choose the earlier offset at overlaps and shift gaps forward.
                "d" -> current.atZone(zone).toLocalDateTime().minusDays(amount).atZone(zone).toInstant()
                "h" -> current.minusSeconds(amount * 3600)
                else -> current.minusSeconds(amount * 60)
            }
        }
        if (match.groupValues[3].isNotEmpty()) current = current.atZone(zone).toLocalDate().atStartOfDay(zone).toInstant()
        require(current.atZone(zone).year in 1900..9999)
        return current
    }

    fun validate(command: ActivityCommand, zone: ZoneId, creating: Boolean) {
        require(command.title.trim().length in 1..200)
        require(command.description.length <= 20000 && command.location.length <= 500)
        require(command.endsAt > command.startsAt)
        require(Duration.between(command.startsAt, command.endsAt) <= Duration.ofDays(7))
        require(command.gatheringAt == null || command.gatheringAt <= command.startsAt)
        for (instant in listOfNotNull(command.startsAt, command.endsAt, command.gatheringAt)) {
            require(instant.atZone(zone).year in 1900..9999)
        }
        if (creating) command.timingRules?.let { rules ->
            require(command.endsAt == command.startsAt.plusSeconds(minutes(rules.duration) * 60))
            val gathering = evaluate(rules.gatheringRule, "start", command.startsAt, zone)
            require(command.gatheringAt == gathering || (command.gatheringAt == null && gathering == command.startsAt))
        }
    }

    fun schedule(command: ActivityCommand, zone: ZoneId, now: Instant): Pair<Instant, List<Instant>> {
        val rules = command.timingRules ?: ActivityTimingRules()
        val invitation = evaluate(rules.invitationRule, "start", command.startsAt, zone)
        val deadline = evaluate(rules.responseDueRule, "start", command.startsAt, zone)
        require(invitation < deadline && deadline <= command.startsAt && deadline > now)
        require(rules.reminderRules.size <= 5)
        val reminders = rules.reminderRules.map { evaluate(it, "deadline", deadline, zone) }.sorted()
        require(reminders.distinct().size == reminders.size)
        require(reminders.all { it > invitation && it < deadline })
        return deadline to (listOf(maxOf(invitation, now)) + reminders.filter { it > now })
    }
}
