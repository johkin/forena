package se.forena.api.notifications

import java.util.UUID
import org.springframework.stereotype.Service
import org.springframework.beans.factory.ObjectProvider
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.transaction.support.TransactionTemplate
import se.forena.api.extensionapi.ExtensionNotifier
import se.forena.api.extensionapi.PrivateExtensionMessage
import se.forena.api.notifications.internal.ExtensionNotificationRepository
import se.forena.api.identity.AdministrationDirectory

@Service
class ExtensionNotifications(private val repository: ExtensionNotificationRepository,
    private val transaction: TransactionTemplate, private val channelProvider: ObjectProvider<PrivateNotificationChannel>,
    private val settings: NotificationSettings, private val directory: AdministrationDirectory) : ExtensionNotifier {
    override fun enqueue(activityId: UUID, purpose: String, recipients: List<UUID>, title: String, body: String) {
        recipients.distinct().forEach { subject -> repository.enqueue(UUID.randomUUID(), activityId,
            purpose, subject, title, body, "/activities/$activityId") }
    }
    fun deliverOne(): Boolean {
        if (!settings.enabled) return false
        val channels = channelProvider.orderedStream().toList()
        val row = transaction.execute {
            repository.recover()
            val selected = repository.claim() ?: return@execute null
            repository.started(selected.id)
            selected
        } ?: return false
        val message = PrivateExtensionMessage(row.id, row.recipientSubject, row.title, row.body, row.path)
        val delivered = try { settings.allows(directory.verifiedEmail(row.recipientSubject)) &&
            channels.getOrNull(row.channelIndex)?.deliverPrivate(message) == true }
            catch (error: Exception) {
                if (error is InterruptedException) Thread.currentThread().interrupt()
                false
            }
        transaction.executeWithoutResult {
            repository.finished(row.id, if (delivered) "sent" else if (row.channelIndex+1 < channels.size) "pending" else "failed", row.channelIndex+1)
        }
        return true
    }
    @Scheduled(fixedDelay=60000, initialDelay=60000)
    fun deliverPending() {
        transaction.executeWithoutResult { repository.cleanup() }
        repeat(50) { if (!deliverOne()) return }
    }
}
