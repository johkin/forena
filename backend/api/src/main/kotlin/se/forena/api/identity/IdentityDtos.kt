package se.forena.api.identity

import java.util.UUID

data class Actor(val subject: UUID, val session: UUID)
data class FamilyPerson(val id: UUID, val name: String)
