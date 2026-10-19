package se.forena.api

import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import se.forena.api.identity.InactiveSession
import se.forena.api.participation.InvitationProblem
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException

import se.forena.api.http.ApiError

@RestControllerAdvice
class ApiErrors {
    @ExceptionHandler(InvitationProblem::class)
    fun invitation(problem: InvitationProblem): ResponseEntity<ApiError> =
        ResponseEntity.status(problem.status).cacheControl(CacheControl.noStore()).body(ApiError(problem.message))

    @ExceptionHandler(InactiveSession::class)
    fun session(): ResponseEntity<ApiError> = ResponseEntity.status(401)
        .cacheControl(CacheControl.noStore()).body(ApiError("Sessionen är inte aktiv."))

    @ExceptionHandler(HttpMessageNotReadableException::class, MethodArgumentTypeMismatchException::class)
    fun invalid(): ResponseEntity<ApiError> = ResponseEntity.badRequest()
        .cacheControl(CacheControl.noStore()).body(ApiError("Ogiltigt kallelsesvar."))
}
