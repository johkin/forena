package se.forena.api.notifications

import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.*
import se.forena.api.identity.CurrentActorService

@RestController
@RequestMapping("/api/push-subscriptions")
class PushController(private val actors: CurrentActorService, private val push: PushService) {
    @GetMapping
    fun settings() = ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(push.settings())

    @PostMapping
    fun subscribe(
        auth: Authentication,
        request: HttpServletRequest,
        @RequestBody command: PushCommand,
    ): ResponseEntity<Map<String, Boolean>> {
        push.subscribe(actors.from(auth, request), command)
        return ResponseEntity.ok()
            .cacheControl(CacheControl.noStore())
            .body(mapOf("active" to true))
    }

    @DeleteMapping
    fun disable(
        auth: Authentication,
        request: HttpServletRequest,
        @RequestBody command: PushCommand,
    ): ResponseEntity<Map<String, Boolean>> {
        push.disable(actors.from(auth, request), command)
        return ResponseEntity.ok()
            .cacheControl(CacheControl.noStore())
            .body(mapOf("active" to false))
    }
}
