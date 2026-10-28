package se.forena.api.identity.internal

import java.util.UUID
import org.springframework.data.annotation.Id
import org.springframework.data.relational.core.mapping.Embedded
import org.springframework.data.relational.core.mapping.Table

@Table(value = "account", schema = "forena")
data class AccountEntity(@Id val subject: UUID, val enabled: Boolean)

@Table(value = "revoked_session", schema = "forena")
data class RevokedSessionEntity(@Id val id: UUID, val subject: UUID)

data class PersonAccessKey(val personId: UUID, val subject: UUID)

@Table(value = "person_access", schema = "forena")
data class PersonAccessEntity(
    @Id @Embedded(onEmpty = Embedded.OnEmpty.USE_EMPTY) val key: PersonAccessKey,
    val organizationId: UUID,
    val kind: String,
    val active: Boolean
)

@Table(value = "person", schema = "forena")
data class PersonEntity(@Id val id: UUID, val organizationId: UUID, val displayName: String)

@Table(value = "native_user", schema = "forena")
data class UserEntity(@Id val subject: UUID, val email: String, val passwordHash: String, val verified: Boolean, val authVersion: Long)

@Table(value = "telegram_link", schema = "forena")
data class TelegramConnectionEntity(@Id val id: UUID)
