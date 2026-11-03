package se.forena.api.activities

import org.springframework.core.annotation.Order
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.security.access.AccessDeniedException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import se.forena.api.http.ApiError

@Order(0)
@RestControllerAdvice(assignableTypes = [TeamRosterController::class, RosterInvitationController::class])
class TeamRosterErrors {
    @ExceptionHandler(IllegalArgumentException::class, HttpMessageNotReadableException::class)
    fun invalid() = error(400, "Kontrollera namn, e-post, roll och datum. Välj en person från rätt förening.")

    @ExceptionHandler(AccessDeniedException::class)
    fun denied() = error(403, "Du saknar behörighet att hantera truppen.")

    @ExceptionHandler(NoSuchElementException::class)
    fun missing() = error(404, "Laget, medlemmen eller gruppen kunde inte hittas. Uppdatera sidan.")

    @ExceptionHandler(IllegalStateException::class, DataIntegrityViolationException::class)
    fun conflict() = error(409, "Ändringen kunde inte sparas. Kontrollera möjliga dubbletter, befintligt medlemskap eller ändrade uppgifter. Inbjudan kan ha ersatts, gått ut eller redan använts. Ditt utkast finns kvar.")

    private fun error(status: Int, message: String): ResponseEntity<ApiError> =
        ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(ApiError(message))
}
