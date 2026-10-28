package se.forena.api.telegram.internal

import java.time.Instant
import java.util.Optional
import java.util.UUID
import org.springframework.data.jdbc.repository.query.Modifying
import org.springframework.data.jdbc.repository.query.Query
import org.springframework.data.repository.Repository
import se.forena.api.identity.TelegramConnection
import se.forena.api.telegram.*

interface TelegramGroupRepository : Repository<TelegramGroupEntity, UUID> {
    @Query("select * from forena.telegram_group where team_id=:team")
    fun findForTeam(team: UUID): List<TelegramGroup>

    @Modifying
    @Query(
        "insert into forena.telegram_group_pairing(fingerprint,team_id,kind,link_id,expires_at) values(:hash,:team,:kind,:link,:expiry)"
    )
    fun createPairing(hash: String, team: UUID, kind: String, link: UUID, expiry: Instant): Int

    @Modifying
    @Query("delete from forena.telegram_group where team_id=:team and kind=:kind")
    fun deleteForTeam(team: UUID, kind: String): Int

    @Modifying
    @Query("delete from forena.telegram_group_pairing where team_id=:team and kind=:kind")
    fun deletePairingsForTeam(team: UUID, kind: String): Int

    @Query("select * from forena.telegram_group where chat_id=:chat")
    fun findByChat(chat: Long): Optional<TelegramGroup>

    @Query(
        "select * from forena.telegram_group_pairing where fingerprint=:hash and link_id=:link and expires_at>:now"
    )
    fun findPairing(hash: String, link: UUID, now: Instant): Optional<GroupPairing>

    @Modifying
    @Query(
        "delete from forena.telegram_group_pairing where fingerprint=:hash and link_id=:link and expires_at>:now"
    )
    fun consumePairing(hash: String, link: UUID, now: Instant): Int

    @Modifying
    @Query(
        "insert into forena.telegram_group(id,team_id,kind,chat_id,link_id,invite_url) values(:id,:team,:kind,:chat,:link,:url)"
    )
    fun insertGroup(id: UUID, team: UUID, kind: String, chat: Long, link: UUID, url: String): Int

    @Query(
        "select id,subject,telegram_user_id,chat_id,auth_version from forena.telegram_link where id=:id"
    )
    fun findOwnerConnection(id: UUID): Optional<TelegramConnection>

    @Modifying
    @Query("delete from forena.telegram_group where chat_id=:chat")
    fun deleteByChat(chat: Long): Int
}

interface TelegramInvitationRepository : Repository<TelegramInvitationEntity, UUID> {
    @Query(
        "select * from forena.telegram_invitation where link_id=:link and message_id=:message and state='sent'"
    )
    fun findByReply(link: UUID, message: Long): Optional<TelegramInvitation>

    @Query(
        "select * from forena.telegram_invitation where id=:id and link_id=:link and message_id=:message and state='sent'"
    )
    fun findByCallback(id: UUID, link: UUID, message: Long): Optional<TelegramInvitation>

    @Query("select * from forena.telegram_invitation where id=:id and link_id=:link for update")
    fun findLocked(id: UUID, link: UUID): TelegramInvitation

    @Modifying
    @Query(
        "update forena.telegram_invitation set invitation_revision=:revision,last_update=:update where id=:id"
    )
    fun advanceRevision(revision: Long, update: Long, id: UUID): Int

    @Query("select * from forena.telegram_invitation where id=:id and link_id=:link")
    fun findForConnection(id: UUID, link: UUID): TelegramInvitation

    @Query("select body from forena.invitation_notification where id=:id")
    fun notificationBody(id: UUID): String
}

interface TelegramDeliveryRepository : Repository<TelegramInvitationEntity, UUID> {
    @Query(
        "select paused_until>clock_timestamp() from forena.telegram_transport_state where id=true"
    )
    fun isPaused(): Boolean

    @Query(
        "select id,invitation_id,recipient_subject,body,activity_revision,invitation_revision from forena.invitation_notification where id=:id"
    )
    fun findNotification(id: UUID): Optional<TelegramNotification>

    @Query("select * from forena.telegram_invitation where notification_id=:id for update")
    fun findLockedNotification(id: UUID): Optional<TelegramInvitation>

    @Modifying
    @Query(
        "insert into forena.telegram_invitation(id,notification_id,link_id,invitation_id,invitation_revision,activity_revision,state) values(:id,:notification,:link,:invitation,:revision,:activityRevision,'uncertain')"
    )
    fun claimDelivery(
        id: UUID,
        notification: UUID,
        link: UUID,
        invitation: UUID,
        revision: Long,
        activityRevision: Long,
    ): Int

    @Query("select * from forena.telegram_invitation where id=:id")
    fun findDelivery(id: UUID): TelegramInvitation

    @Modifying
    @Query(
        "update forena.telegram_transport_state set paused_until=greatest(paused_until,clock_timestamp()+:retry*interval '1 second') where id=true"
    )
    fun pause(retry: Long): Int

    @Modifying
    @Query(
        "update forena.telegram_invitation set state='sent',message_id=:message where id=:id and link_id=:link"
    )
    fun markSent(message: Long, id: UUID, link: UUID): Int
}

interface TelegramWebhookRepository : Repository<TelegramUpdateEntity, Long> {
    @Modifying
    @Query("""delete from forena.telegram_update where id in (
        select id from forena.telegram_update where received_at < :cutoff
        order by received_at,id limit 1000 for update skip locked)""")
    fun purgeExpired(cutoff: Instant): Int

    @Modifying
    @Query(
        "insert into forena.telegram_update(id,state) values(:id,'processing') on conflict(id) do nothing"
    )
    fun claimUpdate(id: Long): Int

    @Modifying
    @Query("update forena.telegram_update set state=:state where id=:id")
    fun finishUpdate(state: String, id: Long): Int
}
