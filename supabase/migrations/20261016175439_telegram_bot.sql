-- Private contact data: never expose Telegram identifiers or pairing proofs in the Data API.
create schema if not exists messaging;
revoke all on schema messaging from public, anon, authenticated;
grant usage on schema messaging to authenticated, service_role;

create table messaging.telegram_connections (
 user_id uuid primary key references auth.users(id) on delete cascade,
 telegram_id text not null unique check (telegram_id ~ '^[1-9][0-9]{0,15}$'),
 consent_at timestamptz not null,
 verified_at timestamptz not null default clock_timestamp(),
 consent_version text not null default 'notifications-v1'
);
create table messaging.telegram_pairings (
 token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
 user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp() + interval '10 minutes',
 consumed_at timestamptz
);
create index telegram_pairings_user_idx on messaging.telegram_pairings(user_id, created_at);
create table messaging.telegram_receipts (
 message_id text primary key check (length(message_id) between 1 and 200),
 created_at timestamptz not null default clock_timestamp()
);
create index telegram_receipts_created_idx on messaging.telegram_receipts(created_at);
create index telegram_pairings_created_idx on messaging.telegram_pairings(created_at);
alter table messaging.telegram_connections enable row level security;
alter table messaging.telegram_pairings enable row level security;
alter table messaging.telegram_receipts enable row level security;
revoke all on messaging.telegram_connections, messaging.telegram_pairings, messaging.telegram_receipts from public, anon, authenticated;

create function messaging.telegram_settings(operation text, pairing_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare current_user_id uuid := auth.uid(); result jsonb;
begin
 if current_user_id is null or not exists (
  select 1 from auth.users where id=current_user_id and email_confirmed_at is not null and not coalesce(is_anonymous,false)
 ) then raise exception 'Verified account required' using errcode='42501'; end if;
 if operation not in ('status','start','disable') or operation is null then
  raise exception 'Invalid operation' using errcode='22023';
 end if;
 if operation <> 'status' then
  -- Only this account's pairing, opt-out and replies are serialized.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('telegram:user:'||current_user_id::text,0));
 end if;
 if operation='start' then
  if pairing_hash is null or pairing_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid proof' using errcode='22023'; end if;
  if exists(select 1 from messaging.telegram_connections where user_id=current_user_id) then
   raise exception 'Disconnect first' using errcode='55000';
  end if;
  if exists(select 1 from messaging.telegram_pairings where user_id=current_user_id and created_at>clock_timestamp()-interval '1 minute')
   or (select count(*) from messaging.telegram_pairings where user_id=current_user_id and created_at>clock_timestamp()-interval '1 hour') >= 5
  then raise exception 'Pairing rate limited' using errcode='54000'; end if;
  update messaging.telegram_pairings set consumed_at=clock_timestamp() where user_id=current_user_id and consumed_at is null;
  insert into messaging.telegram_pairings(token_hash,user_id) values(pairing_hash,current_user_id);
 elsif operation='disable' then
  delete from messaging.telegram_invitations where user_id=current_user_id;
  delete from messaging.telegram_connections where user_id=current_user_id;
  update messaging.telegram_pairings set consumed_at=clock_timestamp() where user_id=current_user_id and consumed_at is null;
 end if;
 select jsonb_build_object('active',true,'accountSuffix',right(telegram_id,4)) into result
 from messaging.telegram_connections where user_id=current_user_id;
 return coalesce(result,'{"active":false}'::jsonb);
end $$;

create function public.telegram_settings(operation text default 'status', pairing_hash text default null) returns jsonb
language sql security invoker set search_path='' as $$ select messaging.telegram_settings(operation,pairing_hash); $$;
revoke all on function messaging.telegram_settings(text,text), public.telegram_settings(text,text) from public, anon;
grant execute on function messaging.telegram_settings(text,text), public.telegram_settings(text,text) to authenticated;

-- Only the secret-verified webhook can use these operations.
create function messaging.receive_telegram(message_id text, sender text, event_at timestamptz, operation text, pairing_hash text) returns boolean
language plpgsql security definer set search_path='' as $$
declare pairing messaging.telegram_pairings%rowtype; target_user_id uuid; chat_lock bigint;
begin
 if message_id is null or length(message_id) not between 1 and 200 or sender is null or sender !~ '^[1-9][0-9]{0,15}$'
  or event_at is null or event_at>clock_timestamp()+interval '5 minutes' or event_at<clock_timestamp()-interval '15 minutes'
  or operation is null or operation not in ('bind','stop') then return false; end if;
 if exists(select 1 from messaging.telegram_receipts r where r.message_id=receive_telegram.message_id) then return false; end if;
 if operation='stop' then
  select c.user_id into target_user_id from messaging.telegram_connections c
   where c.telegram_id=sender and date_trunc('second',c.verified_at)<=event_at;
  if not found then
   -- A bind may have reserved this Telegram account but not committed its connection yet.
   -- Observe that reservation without taking a lock or storing unknown senders.
   chat_lock:=pg_catalog.hashtextextended('telegram:chat:'||sender,0);
   if exists(select 1 from pg_catalog.pg_locks l where l.locktype='advisory' and l.granted
    and l.database=(select oid from pg_catalog.pg_database where datname=current_database())
    and l.pid<>pg_backend_pid() and l.classid=((chat_lock>>32)&4294967295)::oid
    and l.objid=(chat_lock&4294967295)::oid and l.objsubid=1) then
    raise exception 'Telegram operation busy' using errcode='55P03';
   end if;
   return false;
  end if;
 else
  select p.* into pairing from messaging.telegram_pairings p join auth.users u on u.id=p.user_id
   where p.token_hash=pairing_hash and p.consumed_at is null and p.expires_at>clock_timestamp()
    and date_trunc('second',p.created_at)<=event_at and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false);
  if not found then return false; end if;
  target_user_id:=pairing.user_id;
  if exists(select 1 from messaging.telegram_connections c where c.telegram_id=sender or c.user_id=target_user_id) then return false; end if;
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('telegram:chat:'||sender,0)) then
   raise exception 'Telegram operation busy' using errcode='55P03';
  end if;
 end if;
 -- Never queue untrusted ingress on a global or busy account lock. Raising a
 -- retryable failure rolls back the whole operation; the webhook returns 503.
 if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('telegram:user:'||target_user_id::text,0)) then
  raise exception 'Telegram operation busy' using errcode='55P03';
 end if;
 if operation='stop' then
  -- Recheck after locking: an old opt-out must not delete a newly assigned
  -- connection belonging to another account or a later consent generation.
  if not exists(select 1 from messaging.telegram_connections c where c.user_id=target_user_id
   and c.telegram_id=sender and date_trunc('second',c.verified_at)<=event_at) then return false; end if;
 else
  select p.* into pairing from messaging.telegram_pairings p join auth.users u on u.id=p.user_id
   where p.token_hash=pairing_hash and p.user_id=target_user_id and p.consumed_at is null
    and p.expires_at>clock_timestamp() and date_trunc('second',p.created_at)<=event_at
    and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false);
  if not found then return false; end if;
  if exists(select 1 from messaging.telegram_connections c where c.telegram_id=sender or c.user_id=target_user_id) then return false; end if;
 end if;
 insert into messaging.telegram_receipts(message_id) values(receive_telegram.message_id) on conflict do nothing;
 if not found then return false; end if;
 if operation='stop' then
  delete from messaging.telegram_invitations where user_id=target_user_id;
  delete from messaging.telegram_connections c where c.user_id=target_user_id and c.telegram_id=sender;
 else
  insert into messaging.telegram_connections(user_id,telegram_id,consent_at) values(target_user_id,sender,pairing.created_at);
  update messaging.telegram_pairings p set consumed_at=clock_timestamp() where p.token_hash=pairing.token_hash;
 end if;
 return true;
end $$;
create function public.receive_telegram(message_id text, sender text, event_at timestamptz, operation text, pairing_hash text default null) returns boolean
language sql security invoker set search_path='' as $$ select messaging.receive_telegram(message_id,sender,event_at,operation,pairing_hash); $$;
create function messaging.telegram_recipient(target_user_id uuid) returns text
language sql stable security definer set search_path='' as $$ select telegram_id from messaging.telegram_connections where user_id=target_user_id; $$;
create function public.telegram_recipient(target_user_id uuid) returns text
language sql stable security invoker set search_path='' as $$ select messaging.telegram_recipient(target_user_id); $$;
revoke all on function messaging.receive_telegram(text,text,timestamptz,text,text), public.receive_telegram(text,text,timestamptz,text,text),
 messaging.telegram_recipient(uuid), public.telegram_recipient(uuid) from public, anon, authenticated;
grant execute on function messaging.receive_telegram(text,text,timestamptz,text,text), public.receive_telegram(text,text,timestamptz,text,text),
 messaging.telegram_recipient(uuid), public.telegram_recipient(uuid) to service_role;

alter table public.notification_deliveries drop constraint notification_deliveries_channel_check;
alter table public.notification_deliveries add constraint notification_deliveries_channel_check check (channel in ('email','push','whatsapp','telegram'));
alter table public.activity_events drop constraint activity_events_channel_check;
alter table public.activity_events add constraint activity_events_channel_check check (channel is null or channel in ('email','push','whatsapp','telegram','sms','in_app'));

-- Freeze one message per recipient/person at the same boundary as the outbox.
-- Delivery never evaluates invitations or scheduling rules.
create table messaging.telegram_invitations (
 id uuid primary key default gen_random_uuid(),
 outbox_id uuid not null references public.notification_outbox(id) on delete cascade,
 invitation_id uuid not null references public.invitations(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 message jsonb not null,
 expires_at timestamptz not null,
 activity_generation bigint not null,
 provider_message_id text,
 created_at timestamptz not null default clock_timestamp(),
 last_response_at timestamptz,
 last_update_id bigint,
 unique(outbox_id,invitation_id)
);
alter table messaging.telegram_invitations enable row level security;
revoke all on messaging.telegram_invitations from public,anon,authenticated;
create index telegram_invitations_invitation_idx on messaging.telegram_invitations(invitation_id);
create index telegram_invitations_user_idx on messaging.telegram_invitations(user_id);

create function messaging.snapshot_telegram_invitations() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.type not in ('activity_invitation','invitation_reminder') then return new; end if;
 insert into messaging.telegram_invitations(outbox_id,invitation_id,user_id,message,expires_at,activity_generation)
 select new.id,i.id,new.user_id,jsonb_build_object(
  'person',p.display_name,'team',org.name||' · '||t.name,'activity',a.title,
  'when',to_char(a.starts_at at time zone org.time_zone,'YYYY-MM-DD HH24:MI'),
  'location',coalesce(nullif(a.location,''),'Se Förena'),
  'gathering',coalesce(to_char(a.gathering_at at time zone org.time_zone,'YYYY-MM-DD HH24:MI'),'Se Förena'),
  'due',coalesce(to_char(a.response_due_at at time zone org.time_zone,'YYYY-MM-DD HH24:MI'),'Före aktivitetens slut'),
  'url','/activities/'||a.id::text
 ),least(coalesce(a.response_due_at,a.ends_at),a.ends_at),a.discipline_generation
 from public.invitations i
 join public.activities a on a.id=i.activity_id and a.organization_id=new.organization_id
 join public.people p on p.id=i.person_id and p.organization_id=a.organization_id
 join public.teams t on t.id=a.team_id
 join public.organizations org on org.id=a.organization_id
 where a.id::text=new.payload->>'activityId'
  and exists(select 1 from messaging.telegram_connections c where c.user_id=new.user_id)
  and (p.user_id=new.user_id or exists(select 1 from public.person_guardians g where g.person_id=p.id and g.guardian_user_id=new.user_id))
  and (new.type<>'invitation_reminder' or i.response='pending');
 return new;
end $$;
revoke all on function messaging.snapshot_telegram_invitations() from public,anon,authenticated;
create trigger snapshot_telegram_invitations after insert on public.notification_outbox
 for each row execute function messaging.snapshot_telegram_invitations();

create function messaging.telegram_invitation_messages(target_outbox_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'message',message,'providerMessageId',provider_message_id) order by id),'[]'::jsonb)
 from messaging.telegram_invitations where outbox_id=target_outbox_id;
$$;
create function public.telegram_invitation_messages(target_outbox_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select messaging.telegram_invitation_messages(target_outbox_id); $$;
create function messaging.record_telegram_invitation(target_message_id uuid, provider_id text) returns void
language sql security definer set search_path='' as $$
 update messaging.telegram_invitations set provider_message_id=provider_id where id=target_message_id and provider_message_id is null;
$$;
create function public.record_telegram_invitation(target_message_id uuid, provider_id text) returns void
language sql security invoker set search_path='' as $$ select messaging.record_telegram_invitation(target_message_id,provider_id); $$;

create function messaging.respond_telegram(message_id text,sender text,event_at timestamptz,reply_id uuid,answer text) returns text
language plpgsql security definer set search_path='' as $$
declare target messaging.telegram_invitations%rowtype; connected uuid; activity public.activities%rowtype; invitation public.invitations%rowtype;
begin
 if message_id is null or length(message_id) not between 1 and 200 or sender is null or sender !~ '^[1-9][0-9]{0,15}$'
  or event_at is null or event_at>clock_timestamp()+interval '5 minutes' or event_at<clock_timestamp()-interval '15 minutes'
  or answer is null or answer not in ('accepted','declined') or message_id !~ '^u:[0-9]{1,16}$' then return null; end if;
 if exists(select 1 from messaging.telegram_receipts r where r.message_id=respond_telegram.message_id) then return null; end if;
 select user_id into connected from messaging.telegram_connections where telegram_id=sender;
 select * into target from messaging.telegram_invitations where id=reply_id and user_id=connected;
 if not found then return null; end if;
 if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('telegram:user:'||connected::text,0)) then
  raise exception 'Telegram operation busy' using errcode='55P03';
 end if;
 -- Revalidate the account-to-Telegram mapping and reference after serialization.
 if not exists(select 1 from messaging.telegram_connections c where c.telegram_id=sender and c.user_id=connected) then return null; end if;
 select * into target from messaging.telegram_invitations where id=reply_id and user_id=connected;
 if not found then return null; end if;
 insert into messaging.telegram_receipts(message_id) values(respond_telegram.message_id) on conflict do nothing;
 if not found then return null; end if;
 -- Same activity lock as the existing response lifecycle trigger. No AI and no
 -- client-supplied account/person/activity IDs take part in authorization.
 select a.* into activity from public.activities a join public.invitations i on i.activity_id=a.id
 where i.id=target.invitation_id for share of a;
 if not found then return 'unavailable'; end if;
 select * into invitation from public.invitations where id=target.invitation_id for update;
 if not found or activity.status='cancelled' or activity.ends_at<=clock_timestamp()
  or target.activity_generation<>activity.discipline_generation
  or target.expires_at<=clock_timestamp() or activity.response_due_at<=clock_timestamp()
  or activity.invitation_send_at>clock_timestamp()
  or exists(select 1 from messaging.telegram_invitations previous where previous.invitation_id=target.invitation_id and previous.last_update_id >= substring(message_id from 3)::bigint)
  or invitation.responded_at > greatest(target.created_at,(select max(previous.last_response_at) from messaging.telegram_invitations previous where previous.invitation_id=target.invitation_id))
  or date_trunc('second',event_at)<date_trunc('second',target.last_response_at) or date_trunc('second',invitation.responded_at)>event_at then return 'unavailable'; end if;
 if not exists(select 1 from public.people p where p.id=invitation.person_id and p.user_id=connected)
  and not exists(select 1 from public.person_guardians g where g.person_id=invitation.person_id and g.guardian_user_id=connected)
 then return 'unavailable'; end if;
 -- Preserve comments; the ordinary triggers also publish response-change events.
 if invitation.response is distinct from answer then
  update public.invitations set response=answer,responded_at=clock_timestamp() where id=target.invitation_id;
 end if;
 update messaging.telegram_invitations set last_response_at=clock_timestamp(),last_update_id=substring(message_id from 3)::bigint where id=reply_id;
 return answer;
end $$;
create function public.respond_telegram(message_id text,sender text,event_at timestamptz,reply_id uuid,answer text) returns text
language sql security invoker set search_path='' as $$ select messaging.respond_telegram(message_id,sender,event_at,reply_id,answer); $$;
revoke all on function messaging.telegram_invitation_messages(uuid),public.telegram_invitation_messages(uuid),
 messaging.record_telegram_invitation(uuid,text),public.record_telegram_invitation(uuid,text),
 messaging.respond_telegram(text,text,timestamptz,uuid,text),public.respond_telegram(text,text,timestamptz,uuid,text)
 from public,anon,authenticated;
grant execute on function messaging.telegram_invitation_messages(uuid),public.telegram_invitation_messages(uuid),
 messaging.record_telegram_invitation(uuid,text),public.record_telegram_invitation(uuid,text),
 messaging.respond_telegram(text,text,timestamptz,uuid,text),public.respond_telegram(text,text,timestamptz,uuid,text) to service_role;

-- Bounded cleanup; expired button snapshots follow the existing 90-day outbox
-- retention via cascading deletes. No identifier history is retained after opt-out.
create function messaging.prune_telegram_proofs() returns void
language plpgsql security definer set search_path='' as $$
begin
 delete from messaging.telegram_group_pairings where token_hash in (
  select token_hash from messaging.telegram_group_pairings where created_at<clock_timestamp()-interval '1 day' order by created_at limit 10000
 );
 delete from messaging.telegram_pairings where token_hash in (
  select token_hash from messaging.telegram_pairings where created_at<clock_timestamp()-interval '1 day' order by created_at limit 10000
 );
 delete from messaging.telegram_receipts where message_id in (
  select message_id from messaging.telegram_receipts where created_at<clock_timestamp()-interval '1 day' order by created_at limit 10000
 );
end $$;
revoke all on function messaging.prune_telegram_proofs() from public,anon,authenticated;
select cron.schedule('forena-telegram-proof-prune','0 * * * *',$cron$select messaging.prune_telegram_proofs()$cron$);


-- The webhook secret authenticates Telegram, not membership in Förena.
-- Reject irrelevant ingress before locks or receipt writes.



-- Group bindings never receive personal invitations. Only opaque navigation
-- links are shared; the app rechecks each viewer's ordinary RLS permissions.
create table messaging.telegram_groups (
 chat_id text primary key check(chat_id ~ '^-[1-9][0-9]{0,15}$'),
 team_id uuid not null references public.teams(id) on delete cascade,
 kind text not null check(kind in ('team','leaders')),
 created_by uuid not null references auth.users(id) on delete cascade,
 verified_at timestamptz not null default clock_timestamp(),
 unique(team_id,kind)
);
create index telegram_groups_creator_idx on messaging.telegram_groups(created_by);
create table messaging.telegram_group_pairings (
 token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),
 user_id uuid not null references auth.users(id) on delete cascade,
 team_id uuid not null references public.teams(id) on delete cascade,
 kind text not null check(kind in ('team','leaders')),
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '10 minutes',
 consumed_at timestamptz
);
create index telegram_group_pairings_user_idx on messaging.telegram_group_pairings(user_id,created_at);
create index telegram_group_pairings_team_idx on messaging.telegram_group_pairings(team_id);
alter table messaging.telegram_groups enable row level security;
alter table messaging.telegram_group_pairings enable row level security;
revoke all on messaging.telegram_groups,messaging.telegram_group_pairings from public,anon,authenticated;

create function messaging.telegram_group_settings(operation text,target_team_id uuid,chat_kind text,pairing_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); teams jsonb;
begin
 if uid is null or not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null and not coalesce(is_anonymous,false)) then raise exception 'Verified account required' using errcode='42501'; end if;
 if operation is null or operation not in ('status','start','disable') then raise exception 'Invalid operation' using errcode='22023'; end if;
 if operation<>'status' then
  if chat_kind is null or chat_kind not in ('team','leaders') or not private.has_team_permission(target_team_id,'roster.manage',uid) then raise exception 'Team access required' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('telegram:group:'||target_team_id::text,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('telegram:user:'||uid::text,0));
  if operation='disable' then
   delete from messaging.telegram_groups where team_id=target_team_id and kind=chat_kind;
   update messaging.telegram_group_pairings set consumed_at=clock_timestamp() where team_id=target_team_id and kind=chat_kind and consumed_at is null;
  else
   if not exists(select 1 from messaging.telegram_connections where user_id=uid) then raise exception 'Connect private chat first' using errcode='55000'; end if;
   if pairing_hash is null or pairing_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid proof' using errcode='22023'; end if;
   if exists(select 1 from messaging.telegram_group_pairings where user_id=uid and created_at>clock_timestamp()-interval '1 minute')
    or (select count(*) from messaging.telegram_group_pairings where user_id=uid and created_at>clock_timestamp()-interval '1 hour')>=5 then raise exception 'Pairing rate limited' using errcode='54000'; end if;
   update messaging.telegram_group_pairings set consumed_at=clock_timestamp() where team_id=target_team_id and kind=chat_kind and consumed_at is null;
   insert into messaging.telegram_group_pairings(token_hash,user_id,team_id,kind) values(pairing_hash,uid,target_team_id,chat_kind);
  end if;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',o.name||' · '||t.name,
  'teamActive',exists(select 1 from messaging.telegram_groups g where g.team_id=t.id and kind='team'),
  'leadersActive',exists(select 1 from messaging.telegram_groups g where g.team_id=t.id and kind='leaders')) order by o.name,t.name),'[]'::jsonb)
 into teams from public.teams t join public.organizations o on o.id=t.organization_id where private.has_team_permission(t.id,'roster.manage',uid);
 return jsonb_build_object('teams',teams);
end $$;
create function public.telegram_group_settings(operation text default 'status',target_team_id uuid default null,chat_kind text default null,pairing_hash text default null) returns jsonb
language sql security invoker set search_path='' as $$ select messaging.telegram_group_settings(operation,target_team_id,chat_kind,pairing_hash); $$;
revoke all on function messaging.telegram_group_settings(text,uuid,text,text),public.telegram_group_settings(text,uuid,text,text) from public,anon;
grant execute on function messaging.telegram_group_settings(text,uuid,text,text),public.telegram_group_settings(text,uuid,text,text) to authenticated;

create function messaging.bind_telegram_group(pairing_hash text,sender text,target_chat text,event_at timestamptz) returns boolean
language plpgsql security definer set search_path='' as $$
declare p messaging.telegram_group_pairings%rowtype;
begin
 if target_chat is null or target_chat !~ '^-[1-9][0-9]{0,15}$' or event_at is null or event_at<clock_timestamp()-interval '15 minutes' or event_at>clock_timestamp()+interval '5 minutes' then return false; end if;
 select gp.* into p from messaging.telegram_group_pairings gp join messaging.telegram_connections c on c.user_id=gp.user_id and c.telegram_id=sender
 where gp.token_hash=pairing_hash and gp.consumed_at is null and gp.expires_at>clock_timestamp() and date_trunc('second',gp.created_at)<=event_at;
 if not found then return false; end if;
 if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('telegram:group:'||p.team_id::text,0))
  or not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('telegram:user:'||p.user_id::text,0)) then raise exception 'Telegram operation busy' using errcode='55P03'; end if;
 if not private.has_team_permission(p.team_id,'roster.manage',p.user_id) or not exists(select 1 from messaging.telegram_connections c where c.user_id=p.user_id and c.telegram_id=sender)
  or not exists(select 1 from messaging.telegram_group_pairings gp where gp.token_hash=p.token_hash and gp.consumed_at is null and gp.expires_at>clock_timestamp()) then return false; end if;
 -- Never replace an existing group or reassign a chat to a different team.
 insert into messaging.telegram_groups(chat_id,team_id,kind,created_by) values(target_chat,p.team_id,p.kind,p.user_id) on conflict do nothing;
 if not found then return false; end if;
 update messaging.telegram_group_pairings set consumed_at=clock_timestamp() where token_hash=p.token_hash;
 return true;
end $$;
create function public.bind_telegram_group(pairing_hash text,sender text,target_chat text,event_at timestamptz) returns boolean
language sql security invoker set search_path='' as $$ select messaging.bind_telegram_group(pairing_hash,sender,target_chat,event_at); $$;

create function messaging.telegram_group_link(target_chat text,sender text,message_id text) returns text
language plpgsql security definer set search_path='' as $$
declare path text;
begin
 select '/o/'||o.slug||'/t/'||t.slug into path from messaging.telegram_groups g join public.teams t on t.id=g.team_id join public.organizations o on o.id=t.organization_id
 where g.chat_id=target_chat and private.has_team_permission(t.id,'roster.manage',g.created_by)
  and exists(select 1 from messaging.telegram_connections c where c.user_id=g.created_by)
  and exists(select 1 from messaging.telegram_connections c where c.telegram_id=sender);
 if path is null then return null; end if;
 insert into messaging.telegram_receipts(message_id) values(telegram_group_link.message_id) on conflict do nothing;
 if not found then return null; end if;
 return path;
end $$;
create function public.telegram_group_link(target_chat text,sender text,message_id text) returns text
language sql security invoker set search_path='' as $$ select messaging.telegram_group_link(target_chat,sender,message_id); $$;

create function messaging.remove_telegram_chat(target_chat text,event_at timestamptz) returns void
language plpgsql security definer set search_path='' as $$
declare uid uuid;
begin
 if event_at is null or event_at<clock_timestamp()-interval '15 minutes' or event_at>clock_timestamp()+interval '5 minutes' then return; end if;
 if target_chat ~ '^-[1-9][0-9]{0,15}$' then
  delete from messaging.telegram_groups where chat_id=target_chat and date_trunc('second',verified_at)<=event_at;
 else
  select user_id into uid from messaging.telegram_connections where telegram_id=target_chat;
  if uid is null then return; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('telegram:user:'||uid::text,0));
  if exists(select 1 from messaging.telegram_connections where user_id=uid and telegram_id=target_chat and date_trunc('second',verified_at)<=event_at) then
   delete from messaging.telegram_invitations where user_id=uid;
   delete from messaging.telegram_groups where created_by=uid;
   update messaging.telegram_group_pairings set consumed_at=clock_timestamp() where user_id=uid and consumed_at is null;
   update messaging.telegram_pairings set consumed_at=clock_timestamp() where user_id=uid and consumed_at is null;
   delete from messaging.telegram_connections where user_id=uid;
  end if;
 end if;
end $$;
create function public.remove_telegram_chat(target_chat text,event_at timestamptz) returns void
language sql security invoker set search_path='' as $$ select messaging.remove_telegram_chat(target_chat,event_at); $$;

create function messaging.telegram_reply_message(reply_id uuid,sender text) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('text',left('Kallelse för '||(m.message->>'person')||E'\nLag: '||(m.message->>'team')||E'\nAktivitet: '||(m.message->>'activity')||E'\nNär: '||(m.message->>'when')||E'\nPlats: '||(m.message->>'location')||E'\nSamling: '||(m.message->>'gathering')||E'\nSvara senast: '||(m.message->>'due'),3500),'url',m.message->>'url')
 from messaging.telegram_invitations m join messaging.telegram_connections c on c.user_id=m.user_id where m.id=reply_id and c.telegram_id=sender;
$$;
create function public.telegram_reply_message(reply_id uuid,sender text) returns jsonb
language sql stable security invoker set search_path='' as $$ select messaging.telegram_reply_message(reply_id,sender); $$;

-- A 429 pauses this bot across worker invocations; reserve channels still run.
create table messaging.telegram_transport (singleton boolean primary key default true check(singleton), retry_at timestamptz not null);
alter table messaging.telegram_transport enable row level security;
revoke all on messaging.telegram_transport from public,anon,authenticated;
create function messaging.telegram_delivery_failure(target_chat text,retry_seconds integer,blocked boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if blocked then perform messaging.remove_telegram_chat(target_chat,clock_timestamp()); end if;
 if retry_seconds>0 then
  insert into messaging.telegram_transport(singleton,retry_at) values(true,clock_timestamp()+make_interval(secs=>least(86400,retry_seconds)))
  on conflict(singleton) do update set retry_at=greatest(messaging.telegram_transport.retry_at,excluded.retry_at);
 end if;
end $$;
create function public.telegram_delivery_failure(target_chat text,retry_seconds integer default 0,blocked boolean default false) returns void
language sql security invoker set search_path='' as $$ select messaging.telegram_delivery_failure(target_chat,retry_seconds,blocked); $$;
create or replace function messaging.telegram_recipient(target_user_id uuid) returns text
language sql stable security definer set search_path='' as $$
 select telegram_id from messaging.telegram_connections where user_id=target_user_id and not exists(select 1 from messaging.telegram_transport where retry_at>clock_timestamp());
$$;

-- Grants are deliberately explicit: only the authenticated settings API can
-- issue proofs, and only verified server ingress can consume them.
revoke all on function messaging.bind_telegram_group(text,text,text,timestamptz),public.bind_telegram_group(text,text,text,timestamptz),
 messaging.telegram_group_link(text,text,text),public.telegram_group_link(text,text,text),
 messaging.remove_telegram_chat(text,timestamptz),public.remove_telegram_chat(text,timestamptz),
 messaging.telegram_reply_message(uuid,text),public.telegram_reply_message(uuid,text),
 messaging.telegram_delivery_failure(text,integer,boolean),public.telegram_delivery_failure(text,integer,boolean) from public,anon,authenticated;
grant execute on function messaging.bind_telegram_group(text,text,text,timestamptz),public.bind_telegram_group(text,text,text,timestamptz),
 messaging.telegram_group_link(text,text,text),public.telegram_group_link(text,text,text),
 messaging.remove_telegram_chat(text,timestamptz),public.remove_telegram_chat(text,timestamptz),
 messaging.telegram_reply_message(uuid,text),public.telegram_reply_message(uuid,text),
 messaging.telegram_delivery_failure(text,integer,boolean),public.telegram_delivery_failure(text,integer,boolean) to service_role;

create function messaging.telegram_disconnect_cleanup() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 delete from messaging.telegram_invitations where user_id=old.user_id;
 delete from messaging.telegram_groups where created_by=old.user_id;
 update messaging.telegram_pairings set consumed_at=clock_timestamp() where user_id=old.user_id and consumed_at is null;
 update messaging.telegram_group_pairings set consumed_at=clock_timestamp() where user_id=old.user_id and consumed_at is null;
 return old;
end $$;
revoke all on function messaging.telegram_disconnect_cleanup() from public,anon,authenticated;
create trigger telegram_disconnect_cleanup after delete on messaging.telegram_connections
 for each row execute function messaging.telegram_disconnect_cleanup();
