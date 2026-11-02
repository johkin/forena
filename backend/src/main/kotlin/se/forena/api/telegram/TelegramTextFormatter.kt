package se.forena.api.telegram

data class TelegramTextEntity(val type: String, val offset: Int, val length: Int)

data class TelegramTextChunk(val text: String, val entities: List<TelegramTextEntity>)

/** Telegram has no table element. Render Markdown tables as aligned, literal preformatted text. */
object TelegramTextFormatter {
    private val separator = Regex(":?-{3,}:?")

    fun chunks(source: String): List<TelegramTextChunk> {
        val text = StringBuilder()
        val entities = mutableListOf<TelegramTextEntity>()
        val lines = source.lines()
        var line = 0
        while (line < lines.size) {
            val header = cells(lines[line])
            val divider = lines.getOrNull(line + 1)?.let(::cells)
            if (
                header.size >= 2 &&
                    divider?.size == header.size &&
                    divider.all { separator.matches(it) }
            ) {
                val rows = mutableListOf(header)
                var end = line + 2
                while (end < lines.size) {
                    val row = cells(lines[end])
                    if (row.size != header.size) break
                    rows.add(row)
                    end++
                }
                val widths = header.indices.map { column -> rows.maxOf { it[column].length } }
                if (rows.size > 200 || widths.sum() + 2 * (header.size - 1) > 80) {
                    // Preserve oversized tables literally instead of expanding padding without
                    // bound.
                    text.append(lines.subList(line, end).joinToString("\n"))
                    line = end
                    if (line < lines.size) text.append('\n')
                    continue
                }
                val rendered =
                    rows
                        .map { row ->
                            row.mapIndexed { column, cell -> cell.padEnd(widths[column]) }
                                .joinToString("  ")
                                .trimEnd()
                        }
                        .toMutableList()
                rendered.add(1, widths.joinToString("  ") { "-".repeat(it) })
                val table = rendered.joinToString("\n")
                entities.add(TelegramTextEntity("pre", text.length, table.length))
                text.append(table)
                line = end
            } else {
                text.append(lines[line])
                line++
            }
            if (line < lines.size) text.append('\n')
        }
        val result = mutableListOf<TelegramTextChunk>()
        var start = 0
        while (start < text.length) {
            var end = minOf(start + 3800, text.length)
            if (end < text.length && text[end - 1].isHighSurrogate() && text[end].isLowSurrogate())
                end--
            val chunkEntities = entities.mapNotNull { entity ->
                val from = maxOf(start, entity.offset)
                val through = minOf(end, entity.offset + entity.length)
                if (through > from) entity.copy(offset = from - start, length = through - from)
                else null
            }
            result.add(TelegramTextChunk(text.substring(start, end), chunkEntities))
            start = end
        }
        return result
    }

    private fun cells(line: String): List<String> =
        line.trim().removePrefix("|").removeSuffix("|").split('|').map { it.trim() }
}
