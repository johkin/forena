package se.forena.probe.commands

import java.time.Instant
import java.util.UUID

enum class ProbeMode { NORMAL, BLOCK, CRASH }

data class ProbeRequested(val id: UUID, val delayMs: Long, val mode: ProbeMode, val requestedAt: Instant)
data class ProbeReceipt(val id: UUID, val requestedAt: Instant)
