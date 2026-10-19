package se.forena.api

import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import se.forena.api.identity.InactiveSession
import se.forena.api.participation.InvitationProblem

@RestControllerAdvice
class ApiErrors {
    @ExceptionHandler(InvitationProblem::class)
    fun invitation(problem: InvitationProblem): ResponseEntity<Map<String, String>> =
        ResponseEntity.status(problem.status).cacheControl(CacheControl.noStore()).body(mapOf("error" to problem.message))

    @ExceptionHandler(InactiveSession::class)
    fun session(): ResponseEntity<Map<String, String>> = ResponseEntity.status(401)
        .cacheControl(CacheControl.noStore()).body(mapOf("error" to "Sessionen är inte aktiv."))
}
