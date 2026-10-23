package se.forena.api.administration

import jakarta.servlet.http.HttpServletRequest
import java.util.UUID
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.*
import io.swagger.v3.oas.annotations.Parameter
import se.forena.api.identity.CurrentActorService
import se.forena.api.identity.BrowserLoginLimiter

@RestController
@RequestMapping("/api/admin")
class AdministrationController(private val service: AdministrationService, private val actors: CurrentActorService,
                               private val limiter: BrowserLoginLimiter) {
    @GetMapping("/overview")
    fun overview(@Parameter(hidden = true) authentication: Authentication, @Parameter(hidden = true) request: HttpServletRequest): ResponseEntity<AdministrationOverview> =
        response(service.overview(actors.from(authentication, request)))

    @PostMapping("/bootstrap")
    fun bootstrap(@Parameter(hidden = true) authentication: Authentication, @Parameter(hidden = true) request: HttpServletRequest): ResponseEntity<AdministrationOk> {
        val actor = actors.from(authentication, request)
        limiter.admitBootstrap(limiter.client(request), actor.subject)
        return response(service.bootstrap(actor))
    }

    @PostMapping("/platform-administrators")
    fun platform(@Parameter(hidden = true) authentication: Authentication, @Parameter(hidden = true) request: HttpServletRequest,
                 @RequestBody change: AdministratorChange): ResponseEntity<AdministrationOk> =
        response(service.platformAdministrator(actors.from(authentication, request), change))

    @GetMapping("/slug")
    fun slug(@Parameter(hidden = true) authentication: Authentication, @Parameter(hidden = true) request: HttpServletRequest,
             @RequestParam slug: String, @RequestParam(required = false) organizationId: UUID?): ResponseEntity<SlugAvailability> =
        response(service.slug(actors.from(authentication, request), slug, organizationId))

    @PostMapping("/clubs")
    fun createClub(@Parameter(hidden = true) authentication: Authentication, @Parameter(hidden = true) request: HttpServletRequest,
                   @RequestBody command: CreateClub): ResponseEntity<AdministrationResult> =
        response(service.createClub(actors.from(authentication, request), command))

    @PutMapping("/clubs/{clubId}")
    fun updateClub(@Parameter(hidden = true) authentication: Authentication, @Parameter(hidden = true) request: HttpServletRequest,
                   @PathVariable clubId: UUID, @RequestBody change: ClubChange): ResponseEntity<AdministrationOk> =
        response(service.updateClub(actors.from(authentication, request), clubId, change))

    @PostMapping("/clubs/{clubId}/administrators")
    fun clubAdmin(@Parameter(hidden = true) authentication: Authentication, @Parameter(hidden = true) request: HttpServletRequest,
                  @PathVariable clubId: UUID, @RequestBody change: AdministratorChange): ResponseEntity<AdministrationOk> =
        response(service.clubAdministrator(actors.from(authentication, request), clubId, change))

    @PostMapping("/clubs/{clubId}/sections")
    fun createSection(@Parameter(hidden = true) authentication: Authentication, @Parameter(hidden = true) request: HttpServletRequest,
                      @PathVariable clubId: UUID, @RequestBody change: SectionChange): ResponseEntity<AdministrationResult> =
        response(service.saveSection(actors.from(authentication, request), clubId, null, change))

    @PutMapping("/clubs/{clubId}/sections/{sectionId}")
    fun updateSection(@Parameter(hidden = true) authentication: Authentication, @Parameter(hidden = true) request: HttpServletRequest,
                      @PathVariable clubId: UUID, @PathVariable sectionId: UUID, @RequestBody change: SectionChange): ResponseEntity<AdministrationResult> =
        response(service.saveSection(actors.from(authentication, request), clubId, sectionId, change))

    @DeleteMapping("/sections/{sectionId}")
    fun deleteSection(@Parameter(hidden = true) authentication: Authentication, @Parameter(hidden = true) request: HttpServletRequest,
                      @PathVariable sectionId: UUID): ResponseEntity<AdministrationOk> =
        response(service.deleteSection(actors.from(authentication, request), sectionId))

    @PostMapping("/sections/{sectionId}/administrators")
    fun sectionAdmin(@Parameter(hidden = true) authentication: Authentication, @Parameter(hidden = true) request: HttpServletRequest,
                     @PathVariable sectionId: UUID, @RequestBody change: AdministratorChange): ResponseEntity<AdministrationOk> =
        response(service.sectionAdministrator(actors.from(authentication, request), sectionId, change))

    @PostMapping("/sections/{sectionId}/teams")
    fun createTeam(@Parameter(hidden = true) authentication: Authentication, @Parameter(hidden = true) request: HttpServletRequest,
                   @PathVariable sectionId: UUID, @RequestBody change: TeamChange): ResponseEntity<AdministrationResult> =
        response(service.saveTeam(actors.from(authentication, request), sectionId, null, change))

    @PutMapping("/sections/{sectionId}/teams/{teamId}")
    fun updateTeam(@Parameter(hidden = true) authentication: Authentication, @Parameter(hidden = true) request: HttpServletRequest,
                   @PathVariable sectionId: UUID, @PathVariable teamId: UUID, @RequestBody change: TeamChange): ResponseEntity<AdministrationResult> =
        response(service.saveTeam(actors.from(authentication, request), sectionId, teamId, change))

    @DeleteMapping("/teams/{teamId}")
    fun deleteTeam(@Parameter(hidden = true) authentication: Authentication, @Parameter(hidden = true) request: HttpServletRequest,
                   @PathVariable teamId: UUID): ResponseEntity<AdministrationOk> =
        response(service.deleteTeam(actors.from(authentication, request), teamId))

    @PostMapping("/teams/{teamId}/administrators")
    fun teamAdmin(@Parameter(hidden = true) authentication: Authentication, @Parameter(hidden = true) request: HttpServletRequest,
                  @PathVariable teamId: UUID, @RequestBody change: AdministratorChange): ResponseEntity<AdministrationOk> =
        response(service.teamAdministrator(actors.from(authentication, request), teamId, change))

    private fun <T : Any> response(body: T): ResponseEntity<T> = ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body)
}
