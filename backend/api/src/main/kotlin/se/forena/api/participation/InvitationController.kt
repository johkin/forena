package se.forena.api.participation

import java.util.UUID
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.bind.annotation.PathVariable
import se.forena.api.identity.Actor
import tools.jackson.databind.JsonNode

@RestController
class InvitationController(private val invitations: Invitations) {
    @GetMapping("/api/activities/{activityId}/my-invitations")
    fun list(@AuthenticationPrincipal jwt: Jwt, @PathVariable activityId: UUID): ResponseEntity<FamilyInvitations> =
        ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(invitations.list(actor(jwt), activityId))

    @PutMapping("/api/invitations/{invitationId}/respond")
    fun respond(@AuthenticationPrincipal jwt: Jwt, @PathVariable invitationId: UUID,
                @RequestBody body: JsonNode): ResponseEntity<Map<String, Boolean>> {
        if (!body.isObject || body.propertyNames().any { it !in setOf("response", "comment") }) badRequest()
        val response = body.get("response")
        if (response == null || !response.isString || response.asString() !in setOf("pending", "accepted", "declined")) badRequest()
        val comment = body.get("comment")
        if (comment != null && !comment.isNull && !comment.isString) badRequest()
        val text = if (comment == null || comment.isNull) null else comment.asString().trim()
            .codePoints().limit(500).toArray().let { String(it, 0, it.size) }.ifEmpty { null }
        invitations.respond(actor(jwt), invitationId, ResponseChange(response.asString(), body.has("comment"), text))
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(mapOf("ok" to true))
    }

    private fun actor(jwt: Jwt) = Actor(UUID.fromString(jwt.subject), UUID.fromString(jwt.getClaimAsString("session_id")))
    private fun badRequest(): Nothing = throw InvitationProblem(400, "Ogiltigt kallelsesvar.")
}
