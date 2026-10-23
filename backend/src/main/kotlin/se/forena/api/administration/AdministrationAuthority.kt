package se.forena.api.administration

import java.util.UUID

/** Authority required for admission; commands recheck the same rules under their write lock. */
sealed interface AdministrationAuthority {
    data object Platform : AdministrationAuthority
    data class Club(val id: UUID) : AdministrationAuthority
    data class SectionClub(val id: UUID) : AdministrationAuthority
    data class Section(val id: UUID) : AdministrationAuthority
    data class Team(val id: UUID) : AdministrationAuthority
    data class TeamBusiness(val id: UUID) : AdministrationAuthority
}
