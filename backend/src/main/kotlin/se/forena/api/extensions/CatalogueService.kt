package se.forena.api.extensions

import java.util.UUID
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import se.forena.api.administration.AdministrationAuthority
import se.forena.api.administration.AdministrationService
import se.forena.api.extensions.internal.DisciplineCatalogueRepository
import se.forena.api.identity.Actor

@Service
class CatalogueService(
    private val repository: DisciplineCatalogueRepository,
    private val registry: DisciplineRegistry,
    private val authority: AdministrationService,
) {
    @Transactional(readOnly = true)
    fun read(actor: Actor): CatalogueSnapshot {
        authority.authorizeMutation(actor, AdministrationAuthority.Platform)
        val installed = registry.definitions().associateBy { it.key }
        return CatalogueSnapshot(
            repository.categories().map { CatalogueCategory(it.key, it.name) },
            repository.catalogue().map { row ->
                val pkg = installed[row.key]
                CatalogueDiscipline(
                    row.key,
                    pkg?.name ?: row.name,
                    pkg?.category ?: row.categoryKey,
                    row.codeOwned || pkg != null,
                    pkg?.version,
                )
            },
        )
    }

    @Transactional
    fun change(actor: Actor, category: Boolean, command: CatalogueChange?, key: String) {
        authority.authorizeMutation(actor, AdministrationAuthority.Platform)
        check(repository.lock())
        authority.authorizeMutation(actor, AdministrationAuthority.Platform)
        require(key.matches(Regex("[a-z][a-z0-9_-]{0,63}")))
        command?.let { require(it.key == key && it.name.trim().length in 1..100) }
        if (category) {
            if (command == null) check(repository.deleteCategory(key) == 1)
            else repository.category(key, command.name.trim())
        } else {
            require(registry.find(key) == null)
            check(repository.catalogue().none { it.key == key && it.codeOwned })
            if (command == null) check(repository.delete(key) == 1)
            else {
                require(repository.categories().any { it.key == command.category })
                check(
                    repository.save(key, command.name.trim(), requireNotNull(command.category)) == 1
                )
            }
        }
        repository.audit(
            UUID.randomUUID(),
            actor.subject,
            if (command == null) "deleted" else "saved",
            key,
        )
    }
}
