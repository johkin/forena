package se.forena.api.extensions

import org.springframework.core.annotation.Order
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import se.forena.api.http.ApiError

@Order(0)
@RestControllerAdvice(
    basePackages = ["se.forena.api.capabilities.playerevaluation"],
    assignableTypes =
        [DisciplineController::class, InformationController::class, CatalogueController::class, ReadViewController::class]
)
class DisciplineErrors {
    @ExceptionHandler(IllegalArgumentException::class, HttpMessageNotReadableException::class)
    fun invalid() =
        ResponseEntity.badRequest()
            .cacheControl(CacheControl.noStore())
            .body(ApiError("Kontrollera disciplin, paketversion, fält och spelarurval."))

    @ExceptionHandler(IllegalStateException::class, DataIntegrityViolationException::class)
    fun conflict() =
        ResponseEntity.status(409)
            .cacheControl(CacheControl.noStore())
            .body(
                ApiError(
                    "Uppgifterna har ändrats eller är skrivskyddade. Ditt utkast finns kvar. Läs in senaste värden och försök igen."
                )
            )
}
