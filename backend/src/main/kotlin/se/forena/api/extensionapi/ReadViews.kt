package se.forena.api.extensionapi

import java.util.UUID
import se.forena.api.identity.Actor

enum class ViewPlacement { activity, teamReport }
enum class ViewType { list, groupedList, table, information }
enum class FilterType { integer, choice, people }
enum class CellType { text, number, missing }

data class ViewCell(val type: CellType, val text: String? = null, val number: Double? = null)
data class ViewRow(val id: String, val cells: Map<String, ViewCell>, val markers: List<String> = emptyList())
data class ViewColumn(val id: String, val title: String)
data class ViewGroup(val id: String, val title: String, val summary: String, val rows: List<ViewRow>)
data class ReadView(
    val type: ViewType,
    val title: String,
    val columns: List<ViewColumn> = emptyList(),
    val rows: List<ViewRow> = emptyList(),
    val groups: List<ViewGroup> = emptyList(),
    val message: String? = null,
)
data class ViewFilter(
    val id: String, val title: String, val type: FilterType,
    val value: String? = null, val minimum: Int? = null, val maximum: Int? = null,
    val options: List<FieldOption> = emptyList(), val selected: List<String> = emptyList(),
)
data class ReadContribution(
    val id: String, val capabilityKey: String, val placement: ViewPlacement,
    val title: String, val order: Int = 0, val schemaVersion: Int = 1,
    val filters: List<ViewFilter> = emptyList(), val views: List<ReadView> = emptyList(),
)
data class ReadViewQuery(
    val teamId: UUID, val activityId: UUID? = null, val groupCount: Int? = null,
    val mode: String = "ability", val personIds: List<UUID>? = null,
)

/** Spring discovers contributors. Hosts depend only on this contract. */
interface ReadViewContributor {
    val definition: CapabilityDefinition
    fun contributions(actor: Actor, query: ReadViewQuery): List<ReadContribution>
}
