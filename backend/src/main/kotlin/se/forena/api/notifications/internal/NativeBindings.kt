package se.forena.api.notifications.internal

import org.springframework.aot.hint.annotation.RegisterReflectionForBinding
import org.springframework.context.annotation.Configuration
import se.forena.api.notifications.PushSubscription
import se.forena.api.notifications.PushKeys
import se.forena.api.notifications.PushCommand
import se.forena.api.notifications.PushSettings

/** Typed JDBC projections and provider payloads are also reachable in the native runtime. */
@Configuration(proxyBeanMethods = false)
@RegisterReflectionForBinding(
    PushSubscription::class,
    PushKeys::class,
    PushCommand::class,
    PushSettings::class,
)
class NotificationsNativeBindings
