package se.forena.api.administration

import org.springframework.core.annotation.Order
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.security.access.AccessDeniedException
import org.springframework.web.ErrorResponseException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import se.forena.api.http.ApiError

@Order(0)
@RestControllerAdvice(assignableTypes = [AdministrationController::class])
class AdministrationErrors {
    @ExceptionHandler(ErrorResponseException::class)
    fun transport(error: ErrorResponseException): ResponseEntity<ApiError> = ResponseEntity.status(error.statusCode)
        .headers(error.headers).cacheControl(CacheControl.noStore())
        .body(ApiError(if (error.statusCode.value() == 429) "För många administrationsförsök. Försök igen senare." else "Begäran kunde inte genomföras."))

    @ExceptionHandler(IllegalArgumentException::class, HttpMessageNotReadableException::class)
    fun invalid(): ResponseEntity<ApiError> = error(400, "Kontrollera uppgifterna. Mottagaren måste ha ett registrerat, verifierat konto.")
    @ExceptionHandler(AccessDeniedException::class)
    fun denied(): ResponseEntity<ApiError> = error(403, "Du saknar behörighet för denna administration.")
    @ExceptionHandler(NoSuchElementException::class)
    fun missing(): ResponseEntity<ApiError> = error(404, "Klubben, sektionen eller laget kunde inte hittas. Uppdatera sidan.")
    @ExceptionHandler(IllegalStateException::class, DataIntegrityViolationException::class)
    fun conflict(): ResponseEntity<ApiError> = error(409, "Ändringen kunde inte genomföras. Adressen kan vara upptagen, behörigheten ändrad eller sparat underlag hindra borttagning. Ditt utkast finns kvar.")
    private fun error(status: Int, message: String) = ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(ApiError(message))
}
