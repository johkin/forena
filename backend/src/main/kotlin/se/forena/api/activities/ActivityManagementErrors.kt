package se.forena.api.activities

import org.springframework.core.annotation.Order
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.security.access.AccessDeniedException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import se.forena.api.http.ApiError

@Order(0)
@RestControllerAdvice(assignableTypes = [ActivityManagementController::class])
class ActivityManagementErrors {
    @ExceptionHandler(IllegalArgumentException::class, HttpMessageNotReadableException::class)
    fun invalid(): ResponseEntity<ApiError> = ResponseEntity.badRequest().cacheControl(CacheControl.noStore())
        .body(ApiError("Ogiltiga aktivitetsuppgifter eller kallelseval. Kontrollera tider och deltagare."))

    @ExceptionHandler(AccessDeniedException::class)
    fun denied(): ResponseEntity<ApiError> = ResponseEntity.status(403).cacheControl(CacheControl.noStore())
        .body(ApiError("Du saknar behörighet att hantera aktiviteter eller kallelser i laget."))

    @ExceptionHandler(IllegalStateException::class)
    fun conflict(): ResponseEntity<ApiError> = ResponseEntity.status(409).cacheControl(CacheControl.noStore())
        .body(ApiError("Aktiviteten har ändrats, ställts in eller avslutats. Ditt utkast finns kvar. Öppna aktiviteten på nytt för att hämta aktuella uppgifter."))
}
