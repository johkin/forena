package se.forena.api.telegram

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class TelegramTextFormatterTest {
    @Test
    fun `attendance table is aligned literal text with UTF16 entity offsets`() {
        val chunks =
            TelegramTextFormatter.chunks(
                "F2016 👟\n\n| Svar | Antal |\n| --- | ---: |\n| Kommer | 12 |\n| Kan inte | 2 |\n| Ej svarat | 3 |\n\n<okänt & ofarligt>"
            )
        val chunk = chunks.single()
        val entity = chunk.entities.single()
        assertThat(entity.type).isEqualTo("pre")
        assertThat(chunk.text.substring(entity.offset, entity.offset + entity.length))
            .isEqualTo(
                "Svar       Antal\n---------  -----\nKommer     12\nKan inte   2\nEj svarat  3"
            )
        assertThat(chunk.text).endsWith("<okänt & ofarligt>")
    }

    @Test
    fun `long messages preserve all text and valid entity ranges across chunks and emoji`() {
        val prefix = "x".repeat(3799) + "👟"
        val table =
            "| Svar | Antal |\n| --- | --- |\n" + "| Väntar på kallelsesvar | 12 |\n".repeat(180)
        val chunks = TelegramTextFormatter.chunks(prefix + "\n" + table + "y".repeat(4000))
        assertThat(chunks.count { it.entities.isNotEmpty() }).isGreaterThanOrEqualTo(2)
        assertThat(chunks.joinToString("") { it.text })
            .startsWith(prefix)
            .endsWith("y".repeat(4000))
        assertThat(chunks).allSatisfy { chunk ->
            assertThat(chunk.text.length).isLessThanOrEqualTo(3800)
            assertThat(chunk.text.first().isLowSurrogate()).isFalse()
            assertThat(chunk.text.last().isHighSurrogate()).isFalse()
            chunk.entities.forEach { entity ->
                assertThat(entity.offset).isGreaterThanOrEqualTo(0)
                assertThat(entity.offset + entity.length).isLessThanOrEqualTo(chunk.text.length)
            }
        }
    }

    @Test
    fun `ordinary pipes and malformed tables remain literal text`() {
        val text = "Välj A | B\nDet är ingen tabell.\n| Svar | Antal |\n| --- | saknas |"
        val chunk = TelegramTextFormatter.chunks(text).single()
        assertThat(chunk.text).isEqualTo(text)
        assertThat(chunk.entities).isEmpty()
    }
}
