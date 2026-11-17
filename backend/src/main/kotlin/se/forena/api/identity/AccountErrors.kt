package se.forena.api.identity

import org.springframework.core.annotation.Order
import org.springframework.dao.DataAccessException
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.http.ResponseEntity
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.security.access.AccessDeniedException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import se.forena.api.http.ApiError

@Order(0)
@RestControllerAdvice(assignableTypes = [AccountProfileController::class])
class AccountErrors {
    @ExceptionHandler(AccessDeniedException::class)
    fun forbidden() = ResponseEntity.status(403).body(ApiError("Du saknar åtkomst eller behöver verifiera din inloggning igen."))
    @ExceptionHandler(IllegalArgumentException::class, HttpMessageNotReadableException::class)
    fun invalid() = ResponseEntity.badRequest().body(ApiError("Kontrollera uppgifterna. Begäran kunde inte genomföras."))
    @ExceptionHandler(DataAccessException::class)
    fun unavailable() = ResponseEntity.status(503).body(ApiError("Kontouppgifterna kan inte hanteras just nu. Försök igen senare."))
    @ExceptionHandler(DataIntegrityViolationException::class)
    fun conflict() = ResponseEntity.status(409).body(ApiError("Uppgifterna kan inte sparas. Läs in aktuellt underlag och försök igen."))
}
