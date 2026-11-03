package se.forena.api.extensions

import org.springframework.stereotype.Component
import se.forena.api.extensionapi.DisciplineCatalog
import se.forena.api.extensionapi.DisciplinePackage

@Component
class DisciplineRegistry(packages: List<DisciplinePackage>) : DisciplineCatalog {
    private val versions = packages.associateBy { it.definition.key to it.definition.version }
    private val current =
        packages
            .filter { it.selectable }
            .groupBy { it.definition.key }
            .mapValues { (_, entries) ->
                require(entries.size == 1) { "A discipline must have one selectable version" }
                entries.single()
            }

    init {
        require(versions.size == packages.size) { "Duplicate discipline package version" }
    }

    override fun definitions() = current.values.map { it.definition }.sortedBy { it.name }

    override fun find(key: String, version: String?) =
        if (version == null) current[key] else versions[key to version]
}
