package se.forena.api.capabilities.playerevaluation.internal

import java.util.UUID
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import se.forena.api.capabilities.playerevaluation.*

@Repository
class EvaluationRepository(private val jdbc: JdbcClient) {
    fun settings(team: UUID): EvaluationSettings? = jdbc.sql(
        "select revision,default_groups,threshold from forena.player_evaluation where team_id=?"
    ).param(team).query { row, _ -> EvaluationSettings(row.getObject("revision", UUID::class.java), row.getInt("default_groups"), row.getDouble("threshold")) }.optional().orElse(null)

    fun metrics(team: UUID): List<EvaluationMetric> = jdbc.sql(
        "select id,name,kind from forena.player_evaluation_metric where team_id=? order by name,id"
    ).param(team).query { row, _ -> EvaluationMetric(row.getObject("id", UUID::class.java), row.getString("name"), MetricKind.valueOf(row.getString("kind"))) }.list()

    fun scores(team: UUID): List<EvaluationScore> = jdbc.sql(
        "select person_id,metric_id,score from forena.player_evaluation_score where team_id=? order by person_id,metric_id"
    ).param(team).query { row, _ -> EvaluationScore(row.getObject("person_id", UUID::class.java), row.getObject("metric_id", UUID::class.java), row.getDouble("score")) }.list()

    fun settings(team: UUID, groups: Int, threshold: Double) {
        jdbc.sql("""insert into forena.player_evaluation(team_id,revision,default_groups,threshold) values(?,?,?,?)
            on conflict(team_id) do update set revision=excluded.revision,default_groups=excluded.default_groups,threshold=excluded.threshold""")
            .params(team, UUID.randomUUID(), groups, threshold).update()
    }

    fun metric(team: UUID, metric: EvaluationMetric) {
        jdbc.sql("""insert into forena.player_evaluation_metric(id,team_id,name,kind) values(?,?,?,?)
            on conflict(team_id,id) do update set name=excluded.name,kind=excluded.kind""")
            .params(metric.id, team, metric.name.trim(), metric.kind.name).update()
    }

    fun deleteMetric(team: UUID, id: UUID) {
        jdbc.sql("delete from forena.player_evaluation_metric where team_id=? and id=?").params(team, id).update()
    }

    fun score(team: UUID, score: EvaluationScore) {
        jdbc.sql("""insert into forena.player_evaluation_score(team_id,metric_id,person_id,score) values(?,?,?,?)
            on conflict(team_id,metric_id,person_id) do update set score=excluded.score""")
            .params(team, score.metricId, score.personId, score.value.toInt()).update()
    }

    fun disable(team: UUID) {
        jdbc.sql("delete from forena.player_evaluation where team_id=?").param(team).update()
    }
}
