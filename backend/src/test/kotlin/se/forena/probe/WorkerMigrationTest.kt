package se.forena.probe

import liquibase.Contexts
import liquibase.LabelExpression
import liquibase.Liquibase
import liquibase.database.DatabaseFactory
import liquibase.database.jvm.JdbcConnection
import liquibase.resource.ClassLoaderResourceAccessor
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.testcontainers.postgresql.PostgreSQLContainer
import java.sql.DriverManager

class WorkerMigrationTest {
    @ParameterizedTest
    @ValueSource(ints = [0, 2])
    fun `latest schema and cursor upgrade preserve existing committed effect and pending delivery`(baseline: Int) {
        PostgreSQLContainer("postgres:17.6-alpine").withInitScript("init.sql").use { pg ->
            pg.start()
            DriverManager.getConnection(pg.jdbcUrl, pg.username, pg.password).use { connection ->
                connection.createStatement().use { it.execute("set search_path to forena_probe,public") }
                val database = DatabaseFactory.getInstance().findCorrectDatabaseImplementation(JdbcConnection(connection))
                database.defaultSchemaName = "forena_probe"
                database.liquibaseSchemaName = "forena_probe"
                Liquibase("db/changelog.xml", ClassLoaderResourceAccessor(), database).use { migrations ->
                    if (baseline > 0) migrations.update(baseline, Contexts(), LabelExpression())
                    else migrations.update(Contexts(), LabelExpression())
                    connection.createStatement().use { statement ->
                        statement.execute("""
                            insert into probe_run(id,delay_ms,mode,requested_at)
                            values('00000000-0000-0000-0000-000000000001',0,'BLOCK','2026-01-01');
                            insert into probe_effect(id,instance_id,completed_at)
                            values('00000000-0000-0000-0000-000000000001','prior-jvm','2026-01-01');
                            insert into event_publication(id,listener_id,event_type,serialized_event,publication_date,status,completion_attempts)
                            values('00000000-0000-0000-0000-000000000002','listener','type','{"preserve":"exact-bytes"}',
                                '2026-01-01','PROCESSING',3);
                        """)
                    }
                    fun snapshot(): String = connection.createStatement().use { statement ->
                        statement.executeQuery("""
                            select json_build_array((select row_to_json(r) from probe_run r),
                                (select row_to_json(e) from probe_effect e),
                                (select row_to_json(p) from event_publication p))::text
                        """).use { rs -> check(rs.next()); rs.getString(1) }
                    }
                    val before = snapshot()
                    migrations.update(Contexts(), LabelExpression())
                    assertThat(snapshot()).isEqualTo(before)
                    connection.createStatement().use { statement ->
                        statement.executeQuery("select count(*) from probe_worker_cursor where singleton and revision=0 and publication_id is null and publication_date is null")
                            .use { rs -> check(rs.next()); assertThat(rs.getInt(1)).isEqualTo(1) }
                        statement.execute("update probe_worker_cursor set publication_date='2026-01-01',publication_id='00000000-0000-0000-0000-000000000002',revision=7")
                    }
                    migrations.update(Contexts(), LabelExpression())
                    assertThat(snapshot()).isEqualTo(before)
                    connection.createStatement().use { statement ->
                        statement.executeQuery("select count(*) from databasechangelog").use { rs ->
                            check(rs.next()); assertThat(rs.getInt(1)).isEqualTo(3)
                        }
                        statement.executeQuery("select revision from probe_worker_cursor").use { rs ->
                            check(rs.next()); assertThat(rs.getLong(1)).isEqualTo(7)
                        }
                    }
                }
            }
        }
    }
}
