package se.forena.api.assistant

import jakarta.servlet.http.HttpServletRequest
import java.util.UUID
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.*
import se.forena.api.identity.CurrentActorService

@RestController
@RequestMapping("/api/assistant/memories")
class AssistantMemoryController(
    private val actors: CurrentActorService,
    private val memories: AssistantMemoryService,
) {
    @GetMapping
    fun list(
        auth: Authentication,
        request: HttpServletRequest,
        @RequestParam(defaultValue = "personal") scope: String,
        @RequestParam(required = false) organizationId: UUID?,
        @RequestParam(required = false) sectionId: UUID?,
        @RequestParam(required = false) teamId: UUID?,
    ) =
        ResponseEntity.ok()
            .cacheControl(CacheControl.noStore())
            .body(
                memories.list(actors.from(auth, request), scope, organizationId, sectionId, teamId)
            )

    @PutMapping("/{id}")
    fun update(
        auth: Authentication,
        request: HttpServletRequest,
        @PathVariable id: UUID,
        @RequestBody edit: MemoryEdit,
    ): ResponseEntity<Map<String, Boolean>> {
        memories.update(actors.from(auth, request), id, edit)
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(mapOf("ok" to true))
    }

    @DeleteMapping("/{id}")
    fun delete(
        auth: Authentication,
        request: HttpServletRequest,
        @PathVariable id: UUID,
        @RequestParam revision: Long,
    ): ResponseEntity<Map<String, Boolean>> {
        memories.delete(actors.from(auth, request), id, revision)
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(mapOf("ok" to true))
    }
}
