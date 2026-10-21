package se.forena.api

import org.springframework.dao.DataAccessException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component

/** One-shot startup/migration/release verification with runtime credentials; never a health contributor. */
@Component
class DatabaseAccessVerifier(private val jdbc: JdbcTemplate) {
    fun verify() {
        val ready = try {
            val grantsReady = jdbc.queryForObject("""
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
            if (grantsReady) {
                // Prove the expected session schema, without reading stored sessions.
                jdbc.queryForList("select primary_id,session_id,creation_time,expiry_time from forena.spring_session where false")
                jdbc.queryForList("select session_primary_id,attribute_name,attribute_bytes from forena.spring_session_attributes where false")
                jdbc.queryForList("select key_hash,available_at from forena.auth_rate_limit where false")
            }
            grantsReady
        } catch (_: DataAccessException) { false }
        check(ready) { "Runtime database access verification failed" }
    }
}
