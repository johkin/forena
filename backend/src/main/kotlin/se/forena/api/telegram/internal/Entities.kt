package se.forena.api.telegram.internal

import java.util.UUID
import org.springframework.data.annotation.Id
import org.springframework.data.relational.core.mapping.Table

@Table(value = "telegram_group", schema = "forena") data class TelegramGroupEntity(@Id val id: UUID)

@Table(value = "telegram_invitation", schema = "forena")
data class TelegramInvitationEntity(@Id val id: UUID)

@Table(value = "telegram_update", schema = "forena")
data class TelegramUpdateEntity(@Id val id: Long)
