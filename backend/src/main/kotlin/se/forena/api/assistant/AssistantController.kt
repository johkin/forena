package se.forena.api.assistant

import jakarta.servlet.http.HttpServletRequest
import java.util.UUID
import org.springframework.http.CacheControl
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.*
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody
import se.forena.api.identity.CurrentActorService
import tools.jackson.databind.json.JsonMapper

@RestController
@RequestMapping("/api/assistant")
class AssistantController(
    private val actors: CurrentActorService,
    private val assistant: AssistantService,
    private val proposals: AssistantProposalService,
    private val profiles: AssistantProfileService,
    private val json: JsonMapper,
) {
    @GetMapping("/conversations")
    fun list(auth: Authentication, request: HttpServletRequest) =
        noStore(assistant.list(actors.from(auth, request)))

    @PostMapping("/conversations")
    fun create(
        auth: Authentication,
        request: HttpServletRequest,
        @RequestBody command: ConversationCommand,
    ) = noStore(assistant.new(actors.from(auth, request), command))

    @PostMapping("/conversations/{id}/resume")
    fun resume(auth: Authentication, request: HttpServletRequest, @PathVariable id: UUID) =
        noStore(assistant.resume(actors.from(auth, request), id))

    @GetMapping("/conversations/{id}")
    fun view(auth: Authentication, request: HttpServletRequest, @PathVariable id: UUID) =
        noStore(assistant.view(actors.from(auth, request), id))

    @DeleteMapping("/conversations/{id}")
    fun delete(
        auth: Authentication,
        request: HttpServletRequest,
        @PathVariable id: UUID,
    ): ResponseEntity<Map<String, Boolean>> {
        assistant.delete(actors.from(auth, request), id)
        return noStore(mapOf("ok" to true))
    }

    @PostMapping("/conversations/{id}/messages", produces = ["application/x-ndjson"])
    fun send(
        auth: Authentication,
        request: HttpServletRequest,
        @PathVariable id: UUID,
        @RequestBody command: MessageCommand,
    ): ResponseEntity<StreamingResponseBody> {
        val actor = actors.from(auth, request)
        assistant.view(actor, id)
        return ResponseEntity.ok()
            .cacheControl(CacheControl.noStore())
            .contentType(MediaType.parseMediaType("application/x-ndjson"))
            .body(
                StreamingResponseBody { output ->
                    try {
                        assistant.send(actor, id, command) { reply ->
                            output.write((json.writeValueAsString(reply) + "\n").toByteArray())
                            output.flush()
                        }
                    } catch (_: Exception) {
                        output.write(
                            (json.writeValueAsString(
                                    AssistantReply(
                                        "Förena",
                                        null,
                                        "Svaret kunde inte slutföras. Försök igen.",
                                        failed = true,
                                    )
                                ) + "\n")
                                .toByteArray()
                        )
                        output.flush()
                    }
                }
            )
    }

    @PostMapping("/proposals/{id}/confirm")
    fun confirm(auth: Authentication, request: HttpServletRequest, @PathVariable id: UUID) =
        noStore(proposals.confirm(actors.from(auth, request), id))

    @GetMapping("/profiles/{org}")
    fun profile(auth: Authentication, request: HttpServletRequest, @PathVariable org: UUID) =
        noStore(profiles.profile(actors.from(auth, request), org))

    @PutMapping("/profiles/{org}")
    fun save(
        auth: Authentication,
        request: HttpServletRequest,
        @PathVariable org: UUID,
        @RequestBody profile: AssistantProfile,
    ): ResponseEntity<Map<String, Boolean>> {
        profiles.save(actors.from(auth, request), org, profile)
        return noStore(mapOf("ok" to true))
    }

    @GetMapping("/profiles/{org}/sections/{section}")
    fun section(
        auth: Authentication,
        request: HttpServletRequest,
        @PathVariable org: UUID,
        @PathVariable section: UUID,
    ) = noStore(profiles.section(actors.from(auth, request), org, section))

    @PutMapping("/profiles/{org}/sections/{section}")
    fun saveSection(
        auth: Authentication,
        request: HttpServletRequest,
        @PathVariable org: UUID,
        @PathVariable section: UUID,
        @RequestBody profile: SectionProfile,
    ): ResponseEntity<Map<String, Boolean>> {
        profiles.saveSection(actors.from(auth, request), org, section, profile)
        return noStore(mapOf("ok" to true))
    }

    private fun <T : Any> noStore(value: T) =
        ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(value)
}
