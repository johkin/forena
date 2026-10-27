package se.forena.api.activities

import org.springframework.core.annotation.Order
import org.springframework.dao.DataAccessException
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.security.access.AccessDeniedException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import se.forena.api.http.ApiError

@Order(0)
@RestControllerAdvice(assignableTypes = [AttendanceController::class])
class AttendanceErrors {
    @ExceptionHandler(IllegalArgumentException::class, HttpMessageNotReadableException::class)
    fun invalid() = error(400, "Kontrollera personurvalet och bekräfta om du rapporterar 0 närvarande.")

    @ExceptionHandler(AccessDeniedException::class)
    fun denied() = error(403, "Du saknar behörighet att hantera närvaro i aktivitetens lag.")

    @ExceptionHandler(NoSuchElementException::class)
    fun missing() = error(404, "Aktiviteten kunde inte hittas.")

    @ExceptionHandler(IllegalStateException::class)
    fun conflict() = error(409, "Rapporten eller aktiviteten har ändrats, är inställd eller har inte startat. Dina val finns kvar. Läs in senaste rapporten och stäm av före nytt sparande.")

    @ExceptionHandler(DataAccessException::class)
    fun unavailable() = error(503, "Närvaron kunde inte sparas eller hämtas. Dina val finns kvar. Försök igen.")

    private fun error(status: Int, message: String): ResponseEntity<ApiError> =
        ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(ApiError(message))
}
