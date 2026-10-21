package se.forena.api.identity

import java.util.UUID
import com.fasterxml.jackson.annotation.JsonIgnore

/** Request-only credential. Deliberately no generated toString/copy/serialization. */
class Actor(val subject: UUID, val session: UUID, @get:JsonIgnore internal val bearerToken: String)
data class AccessiblePerson(val id: UUID, val name: String)
