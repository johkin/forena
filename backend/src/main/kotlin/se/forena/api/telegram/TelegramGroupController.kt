package se.forena.api.telegram

import jakarta.servlet.http.HttpServletRequest
import java.util.UUID
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.*
import se.forena.api.activities.ActivityManagementService
import se.forena.api.identity.CurrentActorService

data class TelegramGroupOverview(val canManage: Boolean, val links: List<GroupLink>)

@RestController
@RequestMapping("/api/teams/{team}/telegram/groups")
class TelegramGroupController(
    private val actors: CurrentActorService,
    private val groups: TelegramGroupService,
    private val management: ActivityManagementService,
) {
    @GetMapping
    fun links(auth: Authentication, request: HttpServletRequest, @PathVariable team: UUID) =
        ResponseEntity.ok()
            .cacheControl(CacheControl.noStore())
            .body(
                actors.from(auth, request).let { actor ->
                    TelegramGroupOverview(
                        management.canManageRoster(actor, team),
                        groups.links(actor, team),
                    )
                }
            )

    @PostMapping
    fun start(
        auth: Authentication,
        request: HttpServletRequest,
        @PathVariable team: UUID,
        @RequestBody command: GroupCommand,
    ) =
        ResponseEntity.ok()
            .cacheControl(CacheControl.noStore())
            .body(groups.start(actors.from(auth, request), team, command.kind))

    @DeleteMapping("/{kind}")
    fun remove(
        auth: Authentication,
        request: HttpServletRequest,
        @PathVariable team: UUID,
        @PathVariable kind: String,
    ): ResponseEntity<Map<String, Boolean>> {
        groups.disconnect(actors.from(auth, request), team, kind)
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(mapOf("ok" to true))
    }
}
