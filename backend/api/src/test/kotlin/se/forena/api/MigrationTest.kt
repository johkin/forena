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
    @ParameterizedTest @ValueSource(ints = [0, 1])
    fun `empty install or identity baseline upgrade validates and is repeatable without data loss`(baseline: Int) {
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
                    DriverManager.getConnection(pg.jdbcUrl, pg.username, pg.password).use { admin ->
                        admin.prepareStatement("insert into forena.account(subject) values(?)").use {
                            it.setObject(1, subject); it.executeUpdate()
                        }
                    }
                    migrations.update(Contexts(), LabelExpression())
                    migrations.update(Contexts(), LabelExpression())
                    migrations.validate()
                    connection.createStatement().use { statement ->
                        statement.executeQuery("select count(*) from forena.databasechangelog").use {
                            it.next(); assertThat(it.getInt(1)).isEqualTo(2)
                        }
                        statement.executeQuery("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='forena' and c.relkind='r' and c.relname not like 'databasechangelog%' and (not c.relrowsecurity or not c.relforcerowsecurity)").use {
                            it.next(); assertThat(it.getInt(1)).isZero()
                        }
                    }
                    DriverManager.getConnection(pg.jdbcUrl, pg.username, pg.password).use { admin ->
                        admin.prepareStatement("select enabled from forena.account where subject=?").use {
                            it.setObject(1, subject)
                            it.executeQuery().use { rs -> assertThat(rs.next()).isTrue(); assertThat(rs.getBoolean(1)).isTrue() }
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
