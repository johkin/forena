package se.forena.api.extensions.internal

import java.time.Instant
import java.util.UUID
import org.springframework.data.jdbc.repository.query.Modifying
import org.springframework.data.jdbc.repository.query.Query
import org.springframework.data.repository.Repository

interface DisciplineValueRepository : Repository<DisciplineValueEntity, UUID> {
    @Query(
        """select * from forena.discipline_value where team_id=:team and discipline_key=:discipline
        and scope=:scope and anchor_id=:anchor and person_id is not distinct from :person"""
    )
    fun value(
        team: UUID,
        discipline: String,
        scope: String,
        anchor: UUID,
        person: UUID?,
    ): DisciplineValueEntity?

    @Modifying
    @Query(
        """insert into forena.discipline_value(id,organization_id,team_id,discipline_key,package_version,
        scope,anchor_id,activity_id,person_id,revision,values_json)
        values(:id,:organization,:team,:discipline,:version,:scope,:anchor,:activity,:person,:revision,:values)"""
    )
    fun insert(
        id: UUID,
        organization: UUID,
        team: UUID,
        discipline: String,
        version: String,
        scope: String,
        anchor: UUID,
        activity: UUID?,
        person: UUID?,
        revision: Long,
        values: String,
    )

    @Modifying
    @Query(
        "update forena.discipline_value set values_json=:values,revision=revision+1 where id=:id and revision=:revision"
    )
    fun update(id: UUID, revision: Long, values: String): Int

    @Modifying
    @Query(
        """insert into forena.discipline_value_audit(id,value_id,actor_subject,revision,changed_at)
        values(:id,:value,:actor,:revision,:now)"""
    )
    fun audit(id: UUID, value: UUID, actor: UUID, revision: Long, now: Instant)
}

interface InformationRepository : Repository<InformationEntity, UUID> {
    @Query(
        "select * from forena.discipline_information where activity_id=:activity order by owner_key"
    )
    fun activity(activity: UUID): List<InformationEntity>

    @Query(
        "select * from forena.discipline_information where activity_id in (:activities) order by activity_id,owner_key"
    )
    fun activities(activities: Collection<UUID>): List<InformationEntity>

    @Modifying
    @Query(
        """insert into forena.discipline_information(id,activity_id,team_id,organization_id,owner_key,definition_version,discipline_key,
        package_version,values_json,revision,state,close_reason,created_at)
        values(:id,:activity,:team,:organization,:owner,:version,:discipline,:packageVersion,:values,1,:state,null,:now)"""
    )
    fun insert(
        id: UUID,
        activity: UUID,
        team: UUID,
        organization: UUID,
        owner: String,
        version: String,
        discipline: String,
        packageVersion: String,
        values: String,
        state: String,
        now: Instant,
    )

    @Modifying
    @Query(
        """update forena.discipline_information set values_json=:values,state=:state,close_reason=:reason,
        revision=revision+1 where id=:id and revision=:revision"""
    )
    fun update(id: UUID, revision: Long, values: String, state: String, reason: String?): Int

    @Modifying
    @Query(
        """insert into forena.discipline_information_history(id,information_id,revision,actor_subject,
        actor_name,changed_at,previous_json,values_json,state,names_json) values(:id,:information,:revision,:actor,:name,:now,:previous,:values,:state,:names)"""
    )
    fun history(
        id: UUID,
        information: UUID,
        revision: Long,
        actor: UUID?,
        name: String,
        now: Instant,
        previous: String,
        values: String,
        state: String,
        names: String,
    )

    @Query(
        """select h.information_id,h.revision,h.actor_name,h.changed_at,h.previous_json,h.values_json,h.state,h.names_json
        from forena.discipline_information_history h join forena.discipline_information i on i.id=h.information_id
        where i.activity_id=:activity order by h.changed_at,h.id"""
    )
    fun history(activity: UUID): List<InformationHistoryRow>

    @Query(
        "select capability_key,enabled,enabled_at,revision from forena.team_capability where team_id=:team"
    )
    fun settings(team: UUID): List<CapabilitySettingRow>

    @Modifying
    @Query(
        """insert into forena.team_capability(team_id,capability_key,enabled,enabled_at,revision)
        values(:team,:key,:enabled,:now,1) on conflict(team_id,capability_key) do update
        set enabled=excluded.enabled,enabled_at=case when excluded.enabled and not forena.team_capability.enabled
        then excluded.enabled_at else forena.team_capability.enabled_at end,revision=forena.team_capability.revision+1"""
    )
    fun setting(team: UUID, key: String, enabled: Boolean, now: Instant)

    @Modifying
    @Query(
        """insert into forena.team_capability_audit(id,team_id,capability_key,revision,enabled,actor_subject)
        values(:id,:team,:key,:revision,:enabled,:actor)"""
    )
    fun auditSetting(
        id: UUID,
        team: UUID,
        key: String,
        revision: Long,
        enabled: Boolean,
        actor: UUID,
    )

    @Modifying
    @Query(
        """insert into forena.discipline_activity_job(activity_id,team_id,due_at,run_at,state) values(:activity,:team,:due,:due,'pending')
        on conflict(activity_id) do update set due_at=excluded.due_at,run_at=excluded.run_at,state='pending',attempts=0"""
    )
    fun schedule(activity: UUID, team: UUID, due: Instant)

    @Query(
        "select activity_id,due_at from forena.discipline_activity_job where state='pending' and due_at<=:now and run_at<=:now order by run_at,activity_id limit :limit"
    )
    fun due(now: Instant, limit: Int): List<InformationJobRow>

    @Query(
        "select activity_id from forena.discipline_activity_job where team_id=:team and state='pending' order by activity_id"
    )
    fun pendingActivities(team: UUID): List<UUID>

    @Query(
        "select activity_id,due_at from forena.discipline_activity_job where activity_id=:id for update"
    )
    fun lockJob(id: UUID): InformationJobRow?

    @Modifying
    @Query("update forena.discipline_activity_job set state='done' where activity_id=:id")
    fun finish(id: UUID)

    @Modifying
    @Query(
        """update forena.discipline_activity_job set attempts=attempts+1,
        state=case when attempts>=4 then 'failed' else 'pending' end,
        run_at=clock_timestamp()+make_interval(secs=>least(3600,power(2,attempts)::integer*60)) where activity_id=:id"""
    )
    fun failed(id: UUID)

    @Query(
        "select * from forena.discipline_information where activity_id=:activity and state='open'"
    )
    fun open(activity: UUID): List<InformationEntity>

    @Query(
        """select i.* from forena.discipline_information i
        where i.team_id=:team and i.owner_key=:owner and i.state='open' order by i.activity_id"""
    )
    fun open(team: UUID, owner: String): List<InformationEntity>
}

interface DisciplineCatalogueRepository : Repository<DisciplineCatalogueEntity, String> {
    @Query("select * from forena.discipline_catalogue order by name,key")
    fun catalogue(): List<DisciplineCatalogueEntity>

    @Query("select * from forena.discipline_category order by name,key")
    fun categories(): List<DisciplineCategoryEntity>

    @Query("select id from forena.discipline_catalogue_lock for update") fun lock(): Boolean

    @Modifying
    @Query(
        """insert into forena.discipline_catalogue(key,name,category_key) values(:key,:name,:category)
        on conflict(key) do update set name=excluded.name,category_key=excluded.category_key where not forena.discipline_catalogue.code_owned"""
    )
    fun save(key: String, name: String, category: String): Int

    @Modifying
    @Query("delete from forena.discipline_catalogue where key=:key and not code_owned")
    fun delete(key: String): Int

    @Modifying
    @Query(
        """insert into forena.discipline_category(key,name) values(:key,:name)
        on conflict(key) do update set name=excluded.name"""
    )
    fun category(key: String, name: String)

    @Modifying
    @Query("delete from forena.discipline_category where key=:key")
    fun deleteCategory(key: String): Int

    @Modifying
    @Query(
        "insert into forena.discipline_catalogue_audit(id,actor_subject,operation,target_key) values(:id,:actor,:operation,:key)"
    )
    fun audit(id: UUID, actor: UUID, operation: String, key: String)
}

interface CapabilityRepository : Repository<ActivityCapabilityEntity, UUID> {
    @Query("select * from forena.activity_capability where activity_id=:id order by capability_key")
    fun rules(id: UUID): List<ActivityCapabilityEntity>

    @Modifying
    @Query(
        """insert into forena.activity_capability(activity_id,capability_key,discipline_key,
        package_version,definition_version,notifications_enabled,hours_json) values(:id,:key,:discipline,:version,:definition,:enabled,:hours)"""
    )
    fun insert(
        id: UUID,
        key: String,
        discipline: String,
        version: String,
        definition: String,
        enabled: Boolean,
        hours: String,
    )

    @Modifying
    @Query(
        """insert into forena.capability_evaluation(activity_id,run_at) values(:id,current_timestamp)
        on conflict(activity_id) do update set run_at=current_timestamp,revision=forena.capability_evaluation.revision+1,attempts=0,failed=false"""
    )
    fun invalidate(id: UUID)

    @Query(
        """select activity_id,revision from forena.capability_evaluation
        where run_at<=:now and not failed order by run_at,activity_id limit :limit"""
    )
    fun due(now: Instant, limit: Int): List<CapabilityEvaluationRow>

    @Query(
        "select activity_id,revision from forena.capability_evaluation where activity_id=:id for update"
    )
    fun lock(id: UUID): CapabilityEvaluationRow?

    @Modifying
    @Query(
        "update forena.capability_evaluation set run_at=:next,attempts=0,failed=false where activity_id=:id and revision=:revision"
    )
    fun evaluated(id: UUID, revision: Long, next: Instant?): Int

    @Modifying
    @Query(
        """update forena.capability_evaluation set attempts=attempts+1,failed=attempts>=4,
        run_at=clock_timestamp()+make_interval(secs=>least(3600,power(2,attempts)::integer*60)) where activity_id=:id and revision=:revision"""
    )
    fun failed(id: UUID, revision: Long)

    @Query(
        "select hours from forena.capability_checkpoint where activity_id=:id and capability_key=:key"
    )
    fun checkpoints(id: UUID, key: String): List<Int>

    @Modifying
    @Query(
        "insert into forena.capability_checkpoint(activity_id,capability_key,hours) values(:id,:key,:hours) on conflict do nothing"
    )
    fun checkpoint(id: UUID, key: String, hours: Int): Int

    @Query("select * from forena.capability_signal where activity_id=:id order by id")
    fun activitySignals(id: UUID): List<CapabilitySignalEntity>

    @Query(
        "select * from forena.capability_signal where team_id=:team order by evaluated_at desc,id limit 500"
    )
    fun signals(team: UUID): List<CapabilitySignalEntity>

    @Query("select * from forena.capability_signal where id=:id")
    fun signal(id: UUID): CapabilitySignalEntity?

    @Modifying
    @Query(
        """insert into forena.capability_signal(id,activity_id,team_id,discipline_key,capability_key,signal_type,state,
        severity,title,text,actions_json,revision,episode,evaluated_at) values(:id,:activity,:team,:discipline,:key,:type,'active',
        :severity,:title,:text,:actions,1,1,:now)"""
    )
    fun signal(
        id: UUID,
        activity: UUID,
        team: UUID,
        discipline: String,
        key: String,
        type: String,
        severity: String,
        title: String,
        text: String,
        actions: String,
        now: Instant,
    )

    @Modifying
    @Query(
        """update forena.capability_signal set state=:state,severity=:severity,title=:title,text=:text,
        actions_json=:actions,revision=revision+1,episode=:episode,evaluated_at=:now where id=:id and revision=:revision"""
    )
    fun updateSignal(
        id: UUID,
        revision: Long,
        state: String,
        severity: String,
        title: String,
        text: String,
        actions: String,
        episode: Long,
        now: Instant,
    ): Int

    @Modifying
    @Query(
        """insert into forena.capability_signal_action(id,signal_id,episode,actor_subject,action,result)
        values(:id,:signal,:episode,:actor,:action,:result)"""
    )
    fun action(id: UUID, signal: UUID, episode: Long, actor: UUID, action: String, result: String)

    @Query(
        """select signal_id,episode,actor_subject,action,result,created_at from forena.capability_signal_action
        where signal_id in (:signals) order by created_at desc,id limit 1000"""
    )
    fun history(signals: Collection<UUID>): List<SignalActionRow>

    @Query(
        "select max(created_at) from forena.capability_signal_action where signal_id=:signal and action='remind-unanswered' and result='queued'"
    )
    fun lastReminder(signal: UUID): Instant?
}
