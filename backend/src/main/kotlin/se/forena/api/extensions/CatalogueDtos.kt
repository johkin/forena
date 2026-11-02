package se.forena.api.extensions

data class CatalogueCategory(val key: String, val name: String)

data class CatalogueDiscipline(
    val key: String,
    val name: String,
    val category: String,
    val codeOwned: Boolean,
    val packageVersion: String?,
)

data class CatalogueSnapshot(
    val categories: List<CatalogueCategory>,
    val disciplines: List<CatalogueDiscipline>,
)

data class CatalogueChange(val key: String, val name: String, val category: String? = null)
