package se.forena.api.identity

import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/api/telegram/settings")
class TelegramSettingsController(
    private val actors: CurrentActorService,
    private val sessions: SessionService,
    private val telegram: TelegramIdentityService,
) {
    @GetMapping
    fun settings(
        authentication: Authentication,
        request: HttpServletRequest,
    ): ResponseEntity<TelegramSettings> {
        val actor = actors.from(authentication, request)
        sessions.requireActive(actor)
        return ResponseEntity.ok()
            .cacheControl(CacheControl.noStore())
            .body(telegram.settings(actor.subject))
    }

    @PostMapping
    fun change(
        authentication: Authentication,
        request: HttpServletRequest,
        @RequestBody command: TelegramSettingsChange,
    ): ResponseEntity<TelegramSettings> {
        val actor = actors.from(authentication, request)
        sessions.requireActive(actor)
        val result =
            when (command.operation) {
                "start" -> telegram.start(actor.subject, command.consent)
                "disable" -> {
                    telegram.disconnect(actor.subject)
                    telegram.settings(actor.subject)
                }
                else -> throw IllegalArgumentException()
            }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(result)
    }
}
