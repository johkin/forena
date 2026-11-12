-- Keep consumed fingerprints for the entire grant lifetime, including rolling renewals.
-- Deleting/revoking a grant deletes its history as well; raw tokens are never copied here.
create table forena.oauth2_refresh_token_use (
    token_hash varchar(64) primary key check (token_hash ~ '^[0-9a-f]{64}$'),
    authorization_id varchar(100) not null references forena.oauth2_authorization(id) on delete cascade,
    registered_client_id varchar(100) not null references forena.oauth2_registered_client(id) on delete cascade,
    used_at timestamptz not null default current_timestamp
);
create index oauth2_refresh_use_grant on forena.oauth2_refresh_token_use(authorization_id);
create index oauth2_refresh_use_client on forena.oauth2_refresh_token_use(registered_client_id);

grant select, insert, update, delete on forena.oauth2_refresh_token_use to forena_api_runtime;
revoke all on forena.oauth2_refresh_token_use from public;
do $$
declare client_role text;
begin
 foreach client_role in array array['anon','authenticated','service_role'] loop
  if exists(select 1 from pg_roles where rolname=client_role) then
   execute format('revoke all on forena.oauth2_refresh_token_use from %I',client_role);
  end if;
 end loop;
end $$;

-- Preserve identities, callbacks and secrets. Existing grants without a refresh token
-- need a new user authorization once; the next code exchange can then issue refresh.
update forena.oauth2_registered_client
set authorization_grant_types = 'authorization_code,refresh_token',
    token_settings = jsonb_set(
        jsonb_set(token_settings::jsonb, '{settings.token.refresh-token-time-to-live}',
                  '["java.time.Duration",86400.0]'::jsonb),
        '{settings.token.reuse-refresh-tokens}', 'false'::jsonb
    )::text
where scopes = 'mcp:read'
  and client_authentication_methods in ('none','client_secret_basic','client_secret_post')
  and client_settings::jsonb ->> 'settings.client.require-proof-key' = 'true'
  and 'authorization_code' = any(string_to_array(authorization_grant_types, ','))
  and string_to_array(authorization_grant_types, ',') <@ array['authorization_code','refresh_token']::text[];
