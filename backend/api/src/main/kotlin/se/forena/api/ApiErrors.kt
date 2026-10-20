package se.forena.api

import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import se.forena.api.identity.InactiveSession
import se.forena.api.identity.SessionVerificationUnavailable
import se.forena.api.activities.InvitationProblem
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException

import se.forena.api.http.ApiError
import se.forena.api.identity.JwtVerificationUnavailable
import se.forena.api.identity.BrowserLoginRateLimited
import org.springframework.security.oauth2.jwt.JwtException

@RestControllerAdvice
class ApiErrors {
    @ExceptionHandler(BrowserLoginRateLimited::class)
    fun loginRateLimited(problem: BrowserLoginRateLimited): ResponseEntity<ApiError> = ResponseEntity.status(429)
        .cacheControl(CacheControl.noStore()).header("Retry-After", problem.retryAfterSeconds.toString())
        .body(ApiError("För många inloggningsförsök. Försök igen senare."))

    @ExceptionHandler(InvitationProblem::class)
    fun invitation(problem: InvitationProblem): ResponseEntity<ApiError> =
        ResponseEntity.status(problem.status).cacheControl(CacheControl.noStore()).body(ApiError(problem.message))

    @ExceptionHandler(InactiveSession::class, JwtException::class)
    fun session(): ResponseEntity<ApiError> = ResponseEntity.status(401)
        .cacheControl(CacheControl.noStore()).body(ApiError("Sessionen är inte aktiv."))

    @ExceptionHandler(SessionVerificationUnavailable::class, JwtVerificationUnavailable::class)
    fun sessionUnavailable(): ResponseEntity<ApiError> = ResponseEntity.status(503)
        .cacheControl(CacheControl.noStore()).body(ApiError("Sessionen kan inte verifieras just nu."))

    @ExceptionHandler(HttpMessageNotReadableException::class, MethodArgumentTypeMismatchException::class)
    fun invalid(): ResponseEntity<ApiError> = ResponseEntity.badRequest()
        .cacheControl(CacheControl.noStore()).body(ApiError("Ogiltigt kallelsesvar."))
}
