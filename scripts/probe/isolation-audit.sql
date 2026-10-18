-- Read-only catalog snapshot. ONLY forena-kotlin; no queued headers or secrets.
SELECT jsonb_build_object(
  'checked_at',clock_timestamp(),
  'database',current_database(),
  'api_overrides',(SELECT jsonb_agg(jsonb_build_object('database',d.datname,'role',r.rolname,'settings',s.setconfig))
    FROM pg_db_role_setting s LEFT JOIN pg_roles r ON r.oid=s.setrole
    LEFT JOIN pg_database d ON d.oid=s.setdatabase
    WHERE r.rolname='authenticator'),
  'net_owners',(SELECT jsonb_agg(jsonb_build_object('object',c.relname,
    'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text))
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='net' AND c.relname IN ('http_request_queue','_http_response')),
  'role_access',(SELECT jsonb_agg(jsonb_build_object('role',rolname,'login',rolcanlogin,
    'net_usage',has_schema_privilege(oid,'net','USAGE'),
    'queue_select',has_table_privilege(oid,'net.http_request_queue','SELECT'),
    'queue_insert',has_table_privilege(oid,'net.http_request_queue','INSERT'),
    'queue_select_grant',has_table_privilege(oid,'net.http_request_queue','SELECT WITH GRANT OPTION'),
    'probe_usage',has_schema_privilege(oid,'forena_probe','USAGE'),
    'scheduler_usage',has_schema_privilege(oid,'forena_probe_scheduler','USAGE'),
    'scheduler_execute',has_function_privilege(oid,'forena_probe_scheduler.invoke_worker()','EXECUTE'),
    'vault_usage',has_schema_privilege(oid,'vault','USAGE')))
    FROM pg_roles WHERE rolname IN ('postgres','anon','authenticated','forena_probe_runtime','forena_probe_observer')),
  'jobs',(SELECT count(*) FROM cron.job),
  'queued_requests',(SELECT count(*) FROM net.http_request_queue),
  'stored_responses',(SELECT count(*) FROM net._http_response),
  'fixture_exists',to_regnamespace('forena_probe_api_check') IS NOT NULL
) AS audit;
