package se.forena.api.telegram.internal

import org.springframework.aot.hint.annotation.RegisterReflectionForBinding
import org.springframework.context.annotation.Configuration
import se.forena.api.telegram.TelegramButton
import se.forena.api.telegram.TelegramGroup
import se.forena.api.telegram.GroupPairing
import se.forena.api.telegram.GroupLink
import se.forena.api.telegram.GroupStart
import se.forena.api.telegram.TelegramGroupOverview
import se.forena.api.telegram.TelegramInvitation
import se.forena.api.telegram.TelegramReceipt
import se.forena.api.telegram.TelegramNotification

/** Typed JDBC projections and provider payloads are also reachable in the native runtime. */
@Configuration(proxyBeanMethods = false)
@RegisterReflectionForBinding(
    TelegramButton::class,
    TelegramGroup::class,
    GroupPairing::class,
    GroupLink::class,
    GroupStart::class,
    TelegramGroupOverview::class,
    TelegramInvitation::class,
    TelegramReceipt::class,
    TelegramNotification::class,
)
class TelegramNativeBindings
