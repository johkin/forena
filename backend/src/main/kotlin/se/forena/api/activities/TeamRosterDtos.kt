package se.forena.api.activities

import java.util.UUID
import tools.jackson.databind.annotation.JsonSerialize

data class RosterTeam(val id: UUID, val name: String, val organizationName: String)
data class TeamRosterSnapshot(
    val team: RosterTeam,
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC) val people: List<RosterMember>,
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC) val groups: List<RosterSubgroup>
)
data class RosterMember(
    val id: UUID, val name: String,
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC) val roles: List<String>,
    val title: String, val linked: Boolean,
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC) val guardians: List<RosterContact>,
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC) val childIds: List<UUID>
)
data class RosterContact(val name: String, val phone: String)
data class RosterSubgroup(
    val id: UUID, val name: String, val revision: Long,
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC) val personIds: List<UUID>
)
data class RosterNameCommand(val name: String)
data class RosterGroupCommand(
    val name: String,
    @get:JsonSerialize(typing = JsonSerialize.Typing.STATIC) val personIds: List<UUID> = emptyList(),
    val revision: Long? = null
)
