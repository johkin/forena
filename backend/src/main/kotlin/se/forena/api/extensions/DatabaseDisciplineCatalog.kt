package se.forena.api.extensions

import org.springframework.context.annotation.Primary
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import se.forena.api.extensionapi.*
import se.forena.api.extensions.internal.DisciplineCatalogueRepository

@Primary
@Component
class DatabaseDisciplineCatalog(
    private val registered: DisciplineRegistry,
    private val repository: DisciplineCatalogueRepository,
) : DisciplineCatalog {
    @Transactional(readOnly = true)
    override fun definitions(): List<DisciplineDefinition> {
        val installed = registered.definitions().associateBy { it.key }
        return (repository.catalogue().map { row ->
                installed[row.key]
                    ?: DisciplineDefinition(
                        row.key,
                        "",
                        row.name,
                        row.categoryKey,
                        emptyMap(),
                    )
            } + installed.values)
            .distinctBy { it.key }
            .sortedBy { it.name }
    }

    override fun find(key: String, version: String?) = registered.find(key, version)
}
