package se.forena.api.identity.internal

import org.springframework.aot.hint.annotation.RegisterReflectionForBinding
import org.springframework.context.annotation.Configuration
import se.forena.api.identity.TelegramConnection
import se.forena.api.identity.TelegramSettings
import se.forena.api.identity.TelegramSettingsChange
import se.forena.api.identity.AssistantOrganization
import se.forena.api.identity.AssistantTeam
import se.forena.api.identity.AssistantViewer

/** Typed JDBC projections and provider payloads are also reachable in the native runtime. */
@Configuration(proxyBeanMethods = false)
@RegisterReflectionForBinding(
    TelegramConnection::class,
    TelegramSettings::class,
    TelegramSettingsChange::class,
    AssistantOrganization::class,
    AssistantTeam::class,
    AssistantViewer::class,
)
class IdentityNativeBindings
