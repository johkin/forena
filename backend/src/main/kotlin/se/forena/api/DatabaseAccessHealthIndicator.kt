package se.forena.api

import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication
import org.springframework.boot.health.contributor.Health
import org.springframework.boot.health.contributor.HealthIndicator
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component

/** Check the runtime data role without reading business or session data. */
@Component
@ConditionalOnWebApplication
class DatabaseAccessHealthIndicator(private val jdbc: JdbcTemplate) : HealthIndicator {
    override fun health(): Health = try {
        val ready = jdbc.queryForObject("""
            select count(*) > 0 and bool_and(
                has_table_privilege(current_user, c.oid, 'SELECT') and
                has_table_privilege(current_user, c.oid, 'INSERT') and
                has_table_privilege(current_user, c.oid, 'UPDATE') and
                has_table_privilege(current_user, c.oid, 'DELETE') and
                not pg_has_role(current_user, c.relowner, 'USAGE')
            ) and not has_schema_privilege(current_user, 'forena', 'CREATE')
              and not has_any_column_privilege(current_user, 'forena.databasechangelog', 'SELECT')
              and not has_any_column_privilege(current_user, 'forena.databasechangeloglock', 'UPDATE')
            from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'forena' and c.relkind in ('r', 'p')
              and c.relname not in ('databasechangelog', 'databasechangeloglock')
        """, Boolean::class.java) == true
        if (ready) Health.up().build() else Health.down().build()
    } catch (_: Exception) { Health.down().build() }
}
