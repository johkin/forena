package se.forena.api.administration.internal

import java.time.LocalDate
import java.util.UUID
import org.springframework.data.annotation.Id
import org.springframework.data.relational.core.mapping.Table

@Table(value = "organization", schema = "forena")
data class ClubEntity(@Id val id: UUID?, val name: String, val slug: String?, val timeZone: String)

@Table(value = "section", schema = "forena")
data class SectionEntity(@Id val id: UUID?, val organizationId: UUID, val name: String, val slug: String?, val disciplineKey: String)

@Table(value = "team", schema = "forena")
data class AdministrationTeamEntity(@Id val id: UUID?, val organizationId: UUID, val sectionId: UUID?,
    val name: String, val slug: String?, val season: String)

@Table(value = "organization_member", schema = "forena")
data class ClubAdministratorEntity(@Id val id: UUID?, val organizationId: UUID, val subject: UUID, val role: String, val active: Boolean)

@Table(value = "section_administrator", schema = "forena")
data class SectionAdministratorEntity(@Id val id: UUID?, val organizationId: UUID, val sectionId: UUID, val subject: UUID, val active: Boolean)

@Table(value = "team_administrator", schema = "forena")
data class TeamAdministratorEntity(@Id val id: UUID?, val organizationId: UUID, val teamId: UUID, val subject: UUID,
    val personId: UUID, val accessAssignmentId: UUID, val startsOn: LocalDate, val endsOn: LocalDate?, val active: Boolean)

@Table(value = "platform_administrator", schema = "forena")
data class PlatformAdministratorEntity(@Id val subject: UUID)

@Table(value = "administration_state", schema = "forena")
data class AdministrationStateEntity(@Id val id: Boolean, val initialized: Boolean)
