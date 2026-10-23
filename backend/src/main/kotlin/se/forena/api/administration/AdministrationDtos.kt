package se.forena.api.administration

import java.time.LocalDate
import java.util.UUID
import tools.jackson.databind.annotation.JsonSerialize

data class AdministrationOverview(
    val platformAdmin: Boolean,
    val canBootstrap: Boolean,
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC) val platformAdministrators: List<Administrator>,
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC) val clubs: List<AdministrationClub>
)
data class Administrator(val subject: UUID, val email: String, val active: Boolean,
    val startsOn: LocalDate? = null, val endsOn: LocalDate? = null)
data class AdministrationClub(
    val id: UUID, val name: String, val slug: String?, val timeZone: String, val canManage: Boolean,
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC) val administrators: List<Administrator>,
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC) val sections: List<AdministrationSection>
)
data class AdministrationSection(
    val id: UUID, val name: String, val slug: String?, val disciplineKey: String,
    val canManage: Boolean, val canChangeDiscipline: Boolean, val canDelete: Boolean,
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC) val administrators: List<Administrator>,
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC) val teams: List<AdministrationTeam>
)
data class AdministrationTeam(
    val id: UUID, val name: String, val slug: String?, val season: String, val canManage: Boolean, val canDelete: Boolean, val canAssignAdministrators: Boolean,
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC) val administrators: List<Administrator>
)
data class CreateClub(
    val organizationName: String, val organizationSlug: String, val timeZone: String,
    val sectionName: String, val sectionSlug: String, val disciplineKey: String,
    val teamName: String? = null, val teamSlug: String? = null, val season: String = ""
)
data class ClubChange(val name: String, val slug: String, val timeZone: String)
data class SectionChange(val name: String, val slug: String, val disciplineKey: String)
data class TeamChange(val name: String, val slug: String? = null, val season: String = "")
data class AdministratorChange(
    val email: String, val name: String = "", val active: Boolean = true,
    val startsOn: LocalDate? = null, val endsOn: LocalDate? = null
)
data class AdministrationResult(val id: UUID)
data class AdministrationOk(val ok: Boolean = true)
data class SlugAvailability(val status: String)
