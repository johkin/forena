package se.forena.api

import java.sql.DriverManager
import java.util.UUID
import liquibase.Contexts
import liquibase.LabelExpression
import liquibase.Liquibase
import liquibase.database.DatabaseFactory
import liquibase.database.jvm.JdbcConnection
import liquibase.resource.ClassLoaderResourceAccessor
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.testcontainers.postgresql.PostgreSQLContainer

class MigrationTest {
    @ParameterizedTest @ValueSource(ints = [0, 1, 2, 3, 4, 5, 6, 7])
    fun `empty install or previous baseline upgrade validates and is repeatable without data loss`(baseline: Int) {
        PostgreSQLContainer("postgres:17.6-alpine").withInitScript("init.sql").use { pg ->
            pg.start()
            DriverManager.getConnection(pg.jdbcUrl, "forena_api_owner", "local-owner-only").use { connection ->
                val database = DatabaseFactory.getInstance().findCorrectDatabaseImplementation(JdbcConnection(connection))
                database.defaultSchemaName = "forena"
                database.liquibaseSchemaName = "forena"
                Liquibase("db/changelog.xml", ClassLoaderResourceAccessor(), database).use { migrations ->
                    migrations.validate()
                    if (baseline > 0) migrations.update(baseline, Contexts(), LabelExpression())
                    else migrations.update(Contexts(), LabelExpression())
                    val subject = UUID.randomUUID()
                    val legacyInvitation = UUID.randomUUID()
                    val legacyActivity = UUID.randomUUID()
                    DriverManager.getConnection(pg.jdbcUrl, pg.username, pg.password).use { admin ->
                        // Simulate accidental client grants on an old installation; upgrade must revoke them.
                        if (baseline == 2) admin.createStatement().use {
                            it.execute("grant usage on schema forena to anon,authenticated,service_role")
                            it.execute("grant select on forena.invitation to anon,authenticated,service_role")
                        }
                        admin.prepareStatement("insert into forena.account(subject) values(?)").use {
                            it.setObject(1, subject); it.executeUpdate()
                        }
                        if (baseline >= 6) admin.createStatement().use {
                            it.execute("insert into forena.browser_session values(repeat('0',64),'$subject',gen_random_uuid(),'synthetic-legacy-ciphertext',now(),now()+interval '1 hour',now()+interval '30 minutes')")
                        }
                        if (baseline >= 2) {
                            val organization = UUID.randomUUID(); val team = UUID.randomUUID(); val person = UUID.randomUUID()
                            // Existing data from a trigger-based installation must survive the upgrade.
                            admin.createStatement().use {
                                it.execute("insert into forena.organization(id,name) values('$organization','Testklubb')")
                                it.execute("insert into forena.team(id,organization_id,name) values('$team','$organization','Testlag')")
                                it.execute("insert into forena.person(id,organization_id,display_name) values('$person','$organization','Testperson')")
                                it.execute("insert into forena.activity(id,organization_id,team_id,title,starts_at,ends_at) values('$legacyActivity','$organization','$team','Test',now(),now()+interval '1 hour')")
                                it.execute("insert into forena.invitation(id,organization_id,activity_id,person_id,response,responded_at,revision) values('$legacyInvitation','$organization','$legacyActivity','$person','accepted',now(),7)")
                                val sessionColumn = if (baseline < 5) ",session_id" else ""
                                val sessionValue = if (baseline < 5) ",'${UUID.randomUUID()}'" else ""
                                it.execute("insert into forena.invitation_history(invitation_id,organization_id,actor_subject$sessionColumn,channel,previous_response,response,revision) values('$legacyInvitation','$organization','$subject'$sessionValue,'web','pending','accepted',7)")
                                it.execute("insert into forena.activity_signal_state(activity_id,dirty_revision) values('$legacyActivity',9)")
                            }
                        }
                    }
                    migrations.update(Contexts(), LabelExpression())
                    migrations.update(Contexts(), LabelExpression())
                    migrations.validate()
                    connection.createStatement().use { statement ->
                        statement.executeQuery("select count(*) from forena.databasechangelog").use {
                            it.next(); assertThat(it.getInt(1)).isEqualTo(8)
                        }
                        statement.executeQuery("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='forena' and c.relkind='r' and c.relname not like 'databasechangelog%' and (c.relrowsecurity or c.relforcerowsecurity)").use {
                            it.next(); assertThat(it.getInt(1)).isZero()
                        }
                        for (role in listOf("anon", "authenticated", "service_role")) {
                            statement.executeQuery("select has_schema_privilege('$role','forena','USAGE') or has_table_privilege('$role','forena.invitation','SELECT') or has_table_privilege('$role','forena.auth_rate_limit','SELECT') or has_table_privilege('$role','forena.spring_session','SELECT') or has_table_privilege('$role','forena.spring_session_attributes','SELECT')").use {
                                it.next(); assertThat(it.getBoolean(1)).isFalse()
                            }
                        }
                        statement.executeQuery("select count(*) from information_schema.columns where table_schema='forena' and table_name='invitation_history' and column_name='session_id'").use {
                            it.next(); assertThat(it.getInt(1)).isZero()
                        }
                        statement.executeQuery("select count(*) from pg_policies where schemaname='forena'").use {
                            it.next(); assertThat(it.getInt(1)).isZero()
                        }
                        statement.executeQuery("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='forena'").use {
                            it.next(); assertThat(it.getInt(1)).isZero()
                        }
                        statement.executeQuery("select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='forena' and not t.tgisinternal").use {
                            it.next(); assertThat(it.getInt(1)).isZero()
                        }
                    }
                    DriverManager.getConnection(pg.jdbcUrl, pg.username, pg.password).use { admin ->
                        if (baseline >= 2) admin.createStatement().use { statement ->
                            statement.executeQuery("select i.response,i.revision,h.actor_subject,s.dirty_revision from forena.invitation i join forena.invitation_history h on h.invitation_id=i.id join forena.activity_signal_state s on s.activity_id=i.activity_id where i.id='$legacyInvitation'").use {
                                assertThat(it.next()).isTrue()
                                assertThat(it.getString(1)).isEqualTo("accepted")
                                assertThat(it.getLong(2)).isEqualTo(7)
                                assertThat(it.getObject(3,UUID::class.java)).isEqualTo(subject)
                                assertThat(it.getLong(4)).isEqualTo(9)
                            }
                        }
                        admin.prepareStatement("select enabled from forena.account where subject=?").use {
                            it.setObject(1, subject)
                            it.executeQuery().use { rs -> assertThat(rs.next()).isTrue(); assertThat(rs.getBoolean(1)).isTrue() }
                        }
                        if (baseline >= 6) admin.createStatement().use { statement ->
                            statement.executeQuery("select tokens from forena.browser_session where subject='$subject'").use {
                                assertThat(it.next()).isTrue()
                                assertThat(it.getString(1)).isEqualTo("synthetic-legacy-ciphertext")
                            }
                        }
                        assertThatThrownBy { admin.createStatement().use { it.execute("insert into forena.person(id,organization_id,display_name) values(gen_random_uuid(),gen_random_uuid(),'Missing organization')") } }
                            .isInstanceOf(java.sql.SQLException::class.java)
                        assertThatThrownBy { admin.prepareStatement("insert into forena.account(subject) values(?)").use { it.setObject(1, subject); it.executeUpdate() } }
                            .isInstanceOf(java.sql.SQLException::class.java)
                        assertThatThrownBy { admin.createStatement().use { it.execute("insert into forena.organization(id,name) values(gen_random_uuid(),' ')") } }
                            .isInstanceOf(java.sql.SQLException::class.java)
                    }
                }
            }
        }
    }
}
