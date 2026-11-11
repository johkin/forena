package se.forena.api.administration

import java.text.Normalizer
import java.time.ZoneId
import java.util.Locale
import java.util.UUID
import org.springframework.beans.factory.annotation.Value
import org.springframework.security.access.AccessDeniedException
import org.springframework.stereotype.Service
import org.springframework.context.ApplicationEventPublisher
import se.forena.api.extensionapi.DisciplineInputsChanged
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional
import se.forena.api.administration.internal.*
import se.forena.api.identity.Actor
import se.forena.api.identity.AdministrationDirectory
import se.forena.api.identity.DatabaseClockService
import se.forena.api.identity.SessionService
import se.forena.api.extensionapi.DisciplineCatalog

@Service
class AdministrationService(
    private val sessions: SessionService,
    private val access: AdministrationAccessService,
    private val directory: AdministrationDirectory,
    private val clock: DatabaseClockService,
    private val administration: AdministrationRepository,
    private val platforms: PlatformAdministratorRepository,
    private val clubs: ClubRepository,
    private val sections: SectionRepository,
    private val teams: AdministrationTeamRepository,
    private val clubAdmins: ClubAdministratorRepository,
    private val sectionAdmins: SectionAdministratorRepository,
    private val teamAdmins: TeamAdministratorRepository,
    private val disciplines: DisciplineCatalog,
    private val events: ApplicationEventPublisher,
    @Value("\${forena.administration.initial-system-admin-email:}") private val initialEmail: String
) {
    @Transactional
    fun sectionDefaultsContext(actor: Actor,id: UUID,writing: Boolean = false): SectionDefaultsContext {
        sessions.requireActive(actor)
        var section=sections.findById(id) ?: throw NoSuchElementException()
        if (!access.canAdministerSectionBusiness(actor.subject, section.organizationId, id)) denied()
        if(writing) {
            administration.lock()
            section=sections.findById(id) ?: throw NoSuchElementException()
            if (!access.canAdministerSectionBusiness(actor.subject, section.organizationId, id)) denied()
        }
        return SectionDefaultsContext(id,section.organizationId,section.disciplineKey)
    }
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    fun overview(actor: Actor): AdministrationOverview {
        sessions.requireActive(actor)
        val roles = access.roles(actor)
        val platform = roles.platform
        val ownClubs = roles.clubIds
        val ownSections = roles.sectionIds
        val clubIds = roles.organizationIds
        val visibleClubs = if (platform) clubs.findAllByOrderByNameAsc()
            else if (clubIds.isEmpty()) emptyList() else clubs.findByIdInOrderByNameAsc(clubIds)
        val result = visibleClubs.mapNotNull { club ->
            val clubId = requireNotNull(club.id)
            val allSections = sections.findByOrganizationId(clubId)
            val allTeams = teams.findByOrganizationId(clubId)
            val activeTeams = access.currentTeamIds(roles, club)
            val manageClub = platform || clubId in ownClubs
            val visibleSections = allSections.filter { section -> manageClub || section.id in ownSections || allTeams.any { it.sectionId == section.id && it.id in activeTeams } }
            if (!manageClub && visibleSections.isEmpty()) return@mapNotNull null
            AdministrationClub(clubId, club.name, club.slug, club.timeZone, manageClub,
                if (manageClub) clubAdmins.findByOrganizationIdAndActiveTrue(clubId).filter(access::isClubAdministrator).map { administrator(it.subject, it.active) } else emptyList(),
                visibleSections.map { section ->
                    val sectionId = requireNotNull(section.id)
                    val manageSection = manageClub || sectionId in ownSections
                    val sectionTeams = allTeams.filter { it.sectionId == sectionId }
                    AdministrationSection(sectionId, section.name, section.slug, section.disciplineKey, manageSection,
                        administration.sectionDisciplineMutable(sectionId), allSections.size > 1 && administration.sectionDisciplineMutable(sectionId) && administration.sectionHasNoAdministrators(sectionId),
                        if (manageSection) sectionAdmins.findBySectionId(sectionId).map { administrator(it.subject, it.active) } else emptyList(),
                        sectionTeams.filter { manageSection || it.id in activeTeams }.map { team ->
                            val id = requireNotNull(team.id)
                            AdministrationTeam(id, team.name, team.slug, team.season, manageSection || id in activeTeams,
                                administration.teamEmpty(id), clubId in ownClubs || sectionId in ownSections || id in activeTeams,
                                teamAdmins.findByTeamId(id).map { Administrator(it.subject, directory.email(it.subject), it.active, it.startsOn, it.endsOn) })
                        }, clubId in ownClubs || sectionId in ownSections)
                })
        }
        val bootstrap = initialEmail.isNotBlank() && !administration.initialized() && platforms.findAll().isEmpty() &&
            directory.verifiedEmail(actor.subject).equals(initialEmail.trim(), ignoreCase = true)
        return AdministrationOverview(platform, bootstrap,
            if (platform) platforms.findAll().map { administrator(it.subject, true) } else emptyList(), result, disciplines.definitions())
    }

    @Transactional(readOnly = true)
    fun canAdministerTeam(actor: Actor, id: UUID): Boolean {
        sessions.requireActive(actor)
        return access.canAdministerTeamBusiness(actor.subject, id)
    }

    @Transactional(readOnly = true)
    fun authorizeMutation(actor: Actor, authority: AdministrationAuthority) {
        sessions.requireActive(actor)
        when (authority) {
            AdministrationAuthority.Platform -> requirePlatform(actor)
            is AdministrationAuthority.Club -> requireClub(actor, authority.id)
            is AdministrationAuthority.SectionClub -> requireClub(actor,
                (sections.findById(authority.id) ?: throw NoSuchElementException()).organizationId)
            is AdministrationAuthority.Section -> requireSection(actor, sections.findById(authority.id) ?: throw NoSuchElementException())
            is AdministrationAuthority.Team -> requireTeam(actor, teams.findById(authority.id) ?: throw NoSuchElementException())
            is AdministrationAuthority.TeamBusiness -> requireBusinessTeam(actor, teams.findById(authority.id) ?: throw NoSuchElementException())
        }
    }

    @Transactional(readOnly = true)
    fun authorizeBootstrap(actor: Actor) = requireBootstrap(actor)

    private fun requireBootstrap(actor: Actor) {
        sessions.requireActive(actor)
        check(!administration.initialized() && platforms.findAll().isEmpty())
        requireBootstrapIdentity(actor)
    }

    @Transactional
    fun bootstrap(actor: Actor): AdministrationOk {
        requireBootstrap(actor)
        val state = lock(actor)
        check(!state.initialized && platforms.findAll().isEmpty())
        platforms.add(actor.subject)
        administration.initialize()
        audit(actor, "platform.bootstrap", actor.subject)
        return AdministrationOk()
    }

    @Transactional
    fun platformAdministrator(actor: Actor, change: AdministratorChange): AdministrationOk {
        authorizeAndLock(actor) { requirePlatform(actor) }
        val target = directory.verifiedAccount(change.email)
        if (change.active) platforms.add(target)
        else {
            check(platforms.findAll().size > 1 || !access.isPlatformAdministrator(target))
            platforms.remove(target)
        }
        audit(actor, if (change.active) "platform.grant" else "platform.revoke", target)
        return AdministrationOk()
    }

    @Transactional(readOnly = true)
    fun slug(actor: Actor, slug: String, organization: UUID?): SlugAvailability {
        sessions.requireActive(actor)
        if (organization == null) requirePlatform(actor) else requireClub(actor, organization)
        validSlug(slug)
        val existing = clubs.findBySlug(slug)
        return SlugAvailability(if (existing == null || existing.id == organization) "available" else "taken")
    }

    @Transactional
    fun createClub(actor: Actor, command: CreateClub): AdministrationResult {
        authorizeAndLock(actor) { requirePlatform(actor) }
        validName(command.organizationName); validSlug(command.organizationSlug)
        validSection(SectionChange(command.sectionName, command.sectionSlug, command.disciplineKey))
        val zone = zone(command.timeZone)
        val club = clubs.save(ClubEntity(null, command.organizationName.trim(), command.organizationSlug, zone.id))
        val id = requireNotNull(club.id)
        val section = sections.save(SectionEntity(null, id, command.sectionName.trim(), command.sectionSlug, command.disciplineKey))
        if (command.teamName != null) {
            validName(command.teamName)
            val slug = command.teamSlug ?: slugFromName(command.teamName)
            validSlug(slug); require(command.season.length <= 40)
            teams.save(AdministrationTeamEntity(null, id, requireNotNull(section.id), command.teamName.trim(), slug, command.season.trim()))
        }
        audit(actor, "club.create", id)
        return AdministrationResult(id)
    }

    @Transactional
    fun updateClub(actor: Actor, id: UUID, change: ClubChange): AdministrationOk {
        authorizeAndLock(actor) { requireClub(actor, id) }
        val club = clubs.findById(id) ?: throw NoSuchElementException()
        validName(change.name); validSlug(change.slug)
        clubs.save(club.copy(name = change.name.trim(), slug = change.slug, timeZone = zone(change.timeZone).id))
        if(club.timeZone != change.timeZone) teams.findByOrganizationId(id).forEach { team ->
            team.id?.let { events.publishEvent(DisciplineInputsChanged(teamId=it)) }
        }
        audit(actor, "club.update", id)
        return AdministrationOk()
    }

    @Transactional
    fun clubAdministrator(actor: Actor, id: UUID, change: AdministratorChange): AdministrationOk {
        authorizeAndLock(actor) { requirePlatform(actor) }
        clubs.findById(id) ?: throw NoSuchElementException()
        val target = directory.verifiedAccount(change.email)
        val existing = clubAdmins.findByOrganizationIdAndSubject(id, target)
        if (!change.active && existing?.active == true) {
            check(clubAdmins.findByOrganizationIdAndActiveTrue(id).count(access::isClubAdministrator) > 1)
        }
        clubAdmins.save(existing?.copy(role = "admin", active = change.active)
            ?: ClubAdministratorEntity(null, id, target, "admin", change.active))
        audit(actor, if (change.active) "club.admin.grant" else "club.admin.revoke", id, target)
        return AdministrationOk()
    }

    @Transactional
    fun saveSection(actor: Actor, clubId: UUID, id: UUID?, change: SectionChange): AdministrationResult {
        authorizeAndLock(actor) { requireClub(actor, clubId) }
        validSection(change)
        clubs.findById(clubId) ?: throw NoSuchElementException()
        val existing = id?.let { sections.findById(it) ?: throw NoSuchElementException() }
        require(existing == null || existing.organizationId == clubId)
        if (existing != null && existing.disciplineKey != change.disciplineKey) check(administration.sectionDisciplineMutable(requireNotNull(existing.id)))
        val saved = sections.save(SectionEntity(existing?.id, clubId, change.name.trim(), change.slug, change.disciplineKey))
        audit(actor, if (id == null) "section.create" else "section.update", requireNotNull(saved.id))
        return AdministrationResult(saved.id)
    }

    @Transactional
    fun deleteSection(actor: Actor, id: UUID): AdministrationOk {
        authorizeAndLock(actor) {
            val candidate = sections.findById(id) ?: throw NoSuchElementException()
            requireClub(actor, candidate.organizationId)
        }
        val section = sections.findById(id) ?: throw NoSuchElementException()
        check(sections.findByOrganizationId(section.organizationId).size > 1 && teams.findBySectionId(id).isEmpty())
        sections.delete(section)
        audit(actor, "section.delete", id)
        return AdministrationOk()
    }

    @Transactional
    fun sectionAdministrator(actor: Actor, id: UUID, change: AdministratorChange): AdministrationOk {
        authorizeAndLock(actor) {
            val candidate = sections.findById(id) ?: throw NoSuchElementException()
            requireClub(actor, candidate.organizationId)
        }
        val section = sections.findById(id) ?: throw NoSuchElementException()
        val target = directory.verifiedAccount(change.email)
        val existing = sectionAdmins.findBySectionIdAndSubject(id, target)
        if (existing == null && !change.active) return AdministrationOk()
        sectionAdmins.save(existing?.copy(active = change.active)
            ?: SectionAdministratorEntity(null, section.organizationId, id, target, change.active))
        audit(actor, if (change.active) "section.admin.grant" else "section.admin.revoke", id, target)
        return AdministrationOk()
    }

    @Transactional
    fun saveTeam(actor: Actor, sectionId: UUID, id: UUID?, change: TeamChange): AdministrationResult {
        authorizeAndLock(actor) {
            val candidate = sections.findById(sectionId) ?: throw NoSuchElementException()
            if (id == null) requireSection(actor, candidate) else requireTeam(actor, teams.findById(id) ?: throw NoSuchElementException())
        }
        val section = sections.findById(sectionId) ?: throw NoSuchElementException()
        validName(change.name); require(change.season.length <= 40)
        val existing = id?.let { teams.findById(it) ?: throw NoSuchElementException() }
        require(existing == null || existing.sectionId == sectionId)
        val slug = existing?.slug ?: change.slug ?: slugFromName(change.name + " " + change.season)
        validSlug(slug)
        val saved = teams.save(AdministrationTeamEntity(id, section.organizationId, sectionId, change.name.trim(), slug, change.season.trim()))
        audit(actor, if (id == null) "team.create" else "team.update", requireNotNull(saved.id))
        return AdministrationResult(saved.id)
    }

    @Transactional
    fun deleteTeam(actor: Actor, id: UUID): AdministrationOk {
        authorizeAndLock(actor) {
            val candidate = teams.findById(id) ?: throw NoSuchElementException()
            requireTeam(actor, candidate)
        }
        val team = teams.findById(id) ?: throw NoSuchElementException()
        check(administration.teamEmpty(id))
        teams.delete(team); audit(actor, "team.delete", id)
        return AdministrationOk()
    }

    @Transactional
    fun teamAdministrator(actor: Actor, id: UUID, change: AdministratorChange): AdministrationOk {
        authorizeAndLock(actor) {
            val candidate = teams.findById(id) ?: throw NoSuchElementException()
            requireBusinessTeam(actor, candidate)
        }
        val team = teams.findById(id) ?: throw NoSuchElementException()
        val target = directory.verifiedAccount(change.email)
        val club = clubs.findById(team.organizationId) ?: throw NoSuchElementException()
        val starts = change.startsOn ?: today(club)
        require(change.endsOn == null || change.endsOn >= starts)
        val existing = teamAdmins.findByTeamIdAndSubject(id, target)
        if (existing == null && !change.active) return AdministrationOk()
        val person = existing?.personId ?: directory.ownPerson(target, team.organizationId, change.name)
        val accessId = existing?.accessAssignmentId ?: UUID.randomUUID()
        if (existing == null) administration.createReadAccess(accessId, team.organizationId, id, person, starts, change.endsOn, change.active)
        else administration.readAccess(accessId, starts, change.endsOn, change.active)
        teamAdmins.save(TeamAdministratorEntity(existing?.id, team.organizationId, id, target, person, accessId, starts, change.endsOn, change.active))
        audit(actor, if (change.active) "team.admin.grant" else "team.admin.revoke", id, target)
        return AdministrationOk()
    }

    /** Authorize at admission; the global lock still protects all structural invariants. */
    private fun authorizeAndLock(actor: Actor, authorize: () -> Unit) {
        sessions.requireActive(actor)
        authorize()
        lock(actor)
    }

    private fun requireBusinessTeam(actor: Actor, team: AdministrationTeamEntity) {
        // A platform role alone never grants control of business access.
        if (!access.canAdministerTeamBusiness(actor.subject, team)) denied()
    }

    private fun requireBootstrapIdentity(actor: Actor) {
        if (initialEmail.isBlank() || !directory.verifiedEmail(actor.subject).equals(initialEmail.trim(), ignoreCase = true)) denied()
    }

    private fun lock(actor: Actor): AdministrationStateEntity {
        sessions.requireActive(actor)
        return administration.lock()
    }
    private fun requirePlatform(actor: Actor) { if (!access.isPlatformAdministrator(actor.subject)) denied() }
    private fun requireClub(actor: Actor, organization: UUID) {
        if (!access.canAdministerClubStructure(actor.subject, organization)) denied()
    }
    private fun requireSection(actor: Actor, section: SectionEntity) {
        if (!access.canAdministerSectionStructure(actor.subject, section.organizationId, requireNotNull(section.id))) denied()
    }
    private fun requireTeam(actor: Actor, team: AdministrationTeamEntity) {
        if (!access.canAdministerTeamStructure(actor.subject, team)) denied()
    }
    private fun administrator(subject: UUID, active: Boolean) = Administrator(subject, directory.email(subject), active)
    private fun today(club: ClubEntity) = clock.now().atZone(zone(club.timeZone)).toLocalDate()
    private fun validName(value: String) { require(value.trim().length in 1..120) }
    private fun validSlug(value: String) { require(value.length in 1..120 && value.matches(Regex("[a-z0-9]+(?:-[a-z0-9]+)*"))) }
    private fun validSection(change: SectionChange) {
        validName(change.name); validSlug(change.slug)
        require(disciplines.definitions().any { it.key==change.disciplineKey })
    }
    private fun zone(value: String): ZoneId {
        require(value in ZoneId.getAvailableZoneIds())
        return ZoneId.of(value)
    }
    private fun slugFromName(name: String): String = Normalizer.normalize(name.lowercase(Locale.ROOT), Normalizer.Form.NFD)
        .replace(Regex("\\p{M}"), "").replace(Regex("[^a-z0-9]+"), "-").trim('-')
    private fun audit(actor: Actor, operation: String, target: UUID, recipient: UUID? = null) { administration.audit(actor.subject, operation, target, recipient) }
    private fun denied(): Nothing = throw AccessDeniedException("Administration permission required")
}
