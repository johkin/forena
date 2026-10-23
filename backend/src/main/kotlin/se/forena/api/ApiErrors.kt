package se.forena.api

import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.security.access.AccessDeniedException
import org.springframework.security.authentication.AuthenticationServiceException
import org.springframework.security.authentication.BadCredentialsException
import org.springframework.security.oauth2.core.OAuth2AuthenticationException
import org.springframework.web.ErrorResponseException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException
import se.forena.api.http.ApiError

/** HTTP translation belongs here; exception messages may contain private implementation details. */
@RestControllerAdvice
class ApiErrors {
    @ExceptionHandler(ErrorResponseException::class)
    fun transport(error: ErrorResponseException): ResponseEntity<ApiError> = ResponseEntity.status(error.statusCode)
        .cacheControl(CacheControl.noStore()).headers(error.headers)
        .body(ApiError(if (error.statusCode.value() == 429) "För många inloggningsförsök. Försök igen senare." else "Begäran kunde inte genomföras."))

    @ExceptionHandler(NoSuchElementException::class)
    fun missing(): ResponseEntity<ApiError> = ResponseEntity.status(404)
        .cacheControl(CacheControl.noStore()).body(ApiError("Aktiviteten kunde inte hittas."))

    @ExceptionHandler(AccessDeniedException::class)
    fun denied(): ResponseEntity<ApiError> = ResponseEntity.status(403)
        .cacheControl(CacheControl.noStore()).body(ApiError("Kallelsen är inte tillgänglig."))

    @ExceptionHandler(IllegalStateException::class)
    fun conflict(): ResponseEntity<ApiError> = ResponseEntity.status(409)
        .cacheControl(CacheControl.noStore()).body(ApiError("Åtgärden kan inte genomföras i aktuellt tillstånd."))

    @ExceptionHandler(BadCredentialsException::class)
    fun session(): ResponseEntity<ApiError> = ResponseEntity.status(401)
        .cacheControl(CacheControl.noStore()).body(ApiError("Sessionen är inte aktiv."))

    @ExceptionHandler(OAuth2AuthenticationException::class)
    fun oauth(error: OAuth2AuthenticationException): ResponseEntity<ApiError> =
        if (error.error.errorCode == "temporarily_unavailable") sessionUnavailable() else session()

    @ExceptionHandler(AuthenticationServiceException::class)
    fun sessionUnavailable(): ResponseEntity<ApiError> = ResponseEntity.status(503)
        .cacheControl(CacheControl.noStore()).body(ApiError("Sessionen kan inte verifieras just nu."))

    @ExceptionHandler(IllegalArgumentException::class, HttpMessageNotReadableException::class, MethodArgumentTypeMismatchException::class)
    fun invalid(): ResponseEntity<ApiError> = ResponseEntity.badRequest()
        .cacheControl(CacheControl.noStore()).body(ApiError("Ogiltigt kallelsesvar."))
}
