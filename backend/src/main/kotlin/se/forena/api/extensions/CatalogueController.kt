package se.forena.api.extensions

import io.swagger.v3.oas.annotations.Parameter
import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.*
import se.forena.api.identity.CurrentActorService

@RestController
@RequestMapping("/api/discipline-catalogue")
class CatalogueController(
    private val service: CatalogueService,
    private val actors: CurrentActorService,
) {
    @GetMapping
    fun read(
        @Parameter(hidden = true) auth: Authentication,
        @Parameter(hidden = true) request: HttpServletRequest,
    ) =
        ResponseEntity.ok()
            .cacheControl(CacheControl.noStore())
            .body(service.read(actors.from(auth, request)))

    @PutMapping("/{kind}/{key}")
    fun save(
        @Parameter(hidden = true) auth: Authentication,
        @Parameter(hidden = true) request: HttpServletRequest,
        @PathVariable kind: String,
        @PathVariable key: String,
        @RequestBody command: CatalogueChange,
    ): ResponseEntity<Map<String, Boolean>> {
        require(kind in listOf("categories", "disciplines"))
        service.change(actors.from(auth, request), kind == "categories", command, key)
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(mapOf("ok" to true))
    }

    @DeleteMapping("/{kind}/{key}")
    fun delete(
        @Parameter(hidden = true) auth: Authentication,
        @Parameter(hidden = true) request: HttpServletRequest,
        @PathVariable kind: String,
        @PathVariable key: String,
    ): ResponseEntity<Map<String, Boolean>> {
        require(kind in listOf("categories", "disciplines"))
        service.change(actors.from(auth, request), kind == "categories", null, key)
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(mapOf("ok" to true))
    }
}
