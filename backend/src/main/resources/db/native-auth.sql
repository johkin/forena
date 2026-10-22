-- Native authentication infrastructure. Framework tables follow Spring Security 7.1 schemas.
create table forena.native_user (
 subject uuid primary key references forena.account(subject) on delete cascade,
 email varchar(320) not null unique check (email=lower(email)),
 password_hash varchar(255) not null,
 verified boolean not null default false,
 auth_version bigint not null default 0,
 created_at timestamptz not null default now()
);
create table forena.auth_mail_outbox (
 id uuid primary key,
 recipient varchar(320) not null,
 kind varchar(20) not null,
 encrypted_link text not null,
 attempts integer not null default 0,
 next_attempt timestamptz not null default now(),
 expires_at timestamptz not null,
 delivered_at timestamptz
);
create index auth_mail_due on forena.auth_mail_outbox(next_attempt) where delivered_at is null;

create table forena.user_credentials
(
    credential_id                varchar(1000) not null,
    user_entity_user_id          varchar(1000) not null,
    public_key                   bytea         not null,
    signature_count              bigint,
    uv_initialized               boolean,
    backup_eligible              boolean       not null,
    authenticator_transports     varchar(1000),
    public_key_credential_type   varchar(100),
    backup_state                 boolean       not null,
    attestation_object           bytea,
    attestation_client_data_json bytea,
    created                      timestamptz,
    last_used                    timestamptz,
    label                        varchar(1000) not null,
    primary key (credential_id)
);

create table forena.user_entities
(
    id           varchar(1000) not null,
    name         varchar(100)  not null,
    display_name varchar(200),
    primary key (id)
);

create table forena.one_time_tokens(
    token_value varchar(36) not null primary key,
    username    varchar(80) not null,
    expires_at  timestamptz   not null
);

create table forena.oauth2_authorization_consent (
    registered_client_id varchar(100) NOT NULL,
    principal_name varchar(200) NOT NULL,
    authorities varchar(1000) NOT NULL,
    PRIMARY KEY (registered_client_id, principal_name)
);


create table forena.oauth2_authorization (
    id varchar(100) NOT NULL,
    registered_client_id varchar(100) NOT NULL,
    principal_name varchar(200) NOT NULL,
    authorization_grant_type varchar(100) NOT NULL,
    authorized_scopes varchar(1000) DEFAULT NULL,
    attributes text DEFAULT NULL,
    state varchar(500) DEFAULT NULL,
    authorization_code_value text DEFAULT NULL,
    authorization_code_issued_at timestamptz DEFAULT NULL,
    authorization_code_expires_at timestamptz DEFAULT NULL,
    authorization_code_metadata text DEFAULT NULL,
    access_token_value text DEFAULT NULL,
    access_token_issued_at timestamptz DEFAULT NULL,
    access_token_expires_at timestamptz DEFAULT NULL,
    access_token_metadata text DEFAULT NULL,
    access_token_type varchar(100) DEFAULT NULL,
    access_token_scopes varchar(1000) DEFAULT NULL,
    oidc_id_token_value text DEFAULT NULL,
    oidc_id_token_issued_at timestamptz DEFAULT NULL,
    oidc_id_token_expires_at timestamptz DEFAULT NULL,
    oidc_id_token_metadata text DEFAULT NULL,
    refresh_token_value text DEFAULT NULL,
    refresh_token_issued_at timestamptz DEFAULT NULL,
    refresh_token_expires_at timestamptz DEFAULT NULL,
    refresh_token_metadata text DEFAULT NULL,
    user_code_value text DEFAULT NULL,
    user_code_issued_at timestamptz DEFAULT NULL,
    user_code_expires_at timestamptz DEFAULT NULL,
    user_code_metadata text DEFAULT NULL,
    device_code_value text DEFAULT NULL,
    device_code_issued_at timestamptz DEFAULT NULL,
    device_code_expires_at timestamptz DEFAULT NULL,
    device_code_metadata text DEFAULT NULL,
    PRIMARY KEY (id)
);


create table forena.oauth2_registered_client (
    id varchar(100) NOT NULL,
    client_id varchar(100) NOT NULL,
    client_id_issued_at timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
    client_secret varchar(200) DEFAULT NULL,
    client_secret_expires_at timestamptz DEFAULT NULL,
    client_name varchar(200) NOT NULL,
    client_authentication_methods varchar(1000) NOT NULL,
    authorization_grant_types varchar(1000) NOT NULL,
    redirect_uris varchar(1000) DEFAULT NULL,
    post_logout_redirect_uris varchar(1000) DEFAULT NULL,
    scopes varchar(1000) NOT NULL,
    client_settings varchar(2000) NOT NULL,
    token_settings varchar(2000) NOT NULL,
    PRIMARY KEY (id)
);

create unique index native_webauthn_username on forena.user_entities(name);
create index native_credentials_user on forena.user_credentials(user_entity_user_id);
alter table forena.user_credentials add constraint native_credential_owner foreign key(user_entity_user_id) references forena.user_entities(id) on delete cascade;
create unique index native_oauth_client on forena.oauth2_registered_client(client_id);
create index native_oauth_principal on forena.oauth2_authorization(principal_name);
create index native_oauth_access on forena.oauth2_authorization(access_token_value);
create index native_ott_expiry on forena.one_time_tokens(expires_at);
-- Default runtime grants are inherited from migration 010; never expose identity tables through Data API.
revoke all on forena.native_user, forena.auth_mail_outbox, forena.one_time_tokens,
 forena.user_entities, forena.user_credentials, forena.oauth2_registered_client,
 forena.oauth2_authorization, forena.oauth2_authorization_consent from public;
do $$
declare client_role text;
begin
 foreach client_role in array array['anon','authenticated','service_role'] loop
  if exists(select 1 from pg_roles where rolname=client_role) then
   execute format('revoke all on forena.native_user,forena.auth_mail_outbox,forena.one_time_tokens,forena.user_entities,forena.user_credentials,forena.oauth2_registered_client,forena.oauth2_authorization,forena.oauth2_authorization_consent from %I',client_role);
  end if;
 end loop;
end $$;
