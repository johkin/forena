-- Private contact data: never expose phone numbers or pairing proofs in the Data API.
create schema if not exists messaging;
revoke all on schema messaging from public, anon, authenticated;
grant usage on schema messaging to authenticated, service_role;

create table messaging.whatsapp_connections (
 user_id uuid primary key references auth.users(id) on delete cascade,
 wa_id text not null unique check (wa_id ~ '^[1-9][0-9]{6,14}$'),
 consent_at timestamptz not null,
 verified_at timestamptz not null default clock_timestamp(),
 consent_version text not null default 'notifications-v1'
);
create table messaging.whatsapp_pairings (
 token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
 user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp() + interval '10 minutes',
 consumed_at timestamptz
);
create index whatsapp_pairings_user_idx on messaging.whatsapp_pairings(user_id, created_at);
create table messaging.whatsapp_receipts (
 message_id text primary key check (length(message_id) between 1 and 200),
 created_at timestamptz not null default clock_timestamp()
);
create index whatsapp_receipts_created_idx on messaging.whatsapp_receipts(created_at);
create index whatsapp_pairings_created_idx on messaging.whatsapp_pairings(created_at);
alter table messaging.whatsapp_connections enable row level security;
alter table messaging.whatsapp_pairings enable row level security;
alter table messaging.whatsapp_receipts enable row level security;
revoke all on all tables in schema messaging from public, anon, authenticated;

create function messaging.whatsapp_settings(operation text, pairing_hash text) returns jsonb
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
  -- Pairing, opt-out and account actions share this lock, so revocation cannot
  -- race a pending pairing into re-enabling a disabled channel.
  perform pg_catalog.pg_advisory_xact_lock(690069);
 end if;
 if operation='start' then
  if pairing_hash is null or pairing_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid proof' using errcode='22023'; end if;
  if exists(select 1 from messaging.whatsapp_connections where user_id=current_user_id) then
   raise exception 'Disconnect first' using errcode='55000';
  end if;
  if exists(select 1 from messaging.whatsapp_pairings where user_id=current_user_id and created_at>clock_timestamp()-interval '1 minute')
   or (select count(*) from messaging.whatsapp_pairings where user_id=current_user_id and created_at>clock_timestamp()-interval '1 hour') >= 5
  then raise exception 'Pairing rate limited' using errcode='54000'; end if;
  update messaging.whatsapp_pairings set consumed_at=clock_timestamp() where user_id=current_user_id and consumed_at is null;
  delete from messaging.whatsapp_pairings where token_hash in (
   select token_hash from messaging.whatsapp_pairings where created_at<clock_timestamp()-interval '1 day' limit 1000
  );
  insert into messaging.whatsapp_pairings(token_hash,user_id) values(pairing_hash,current_user_id);
 elsif operation='disable' then
  delete from messaging.whatsapp_connections where user_id=current_user_id;
  update messaging.whatsapp_pairings set consumed_at=clock_timestamp() where user_id=current_user_id and consumed_at is null;
 end if;
 select jsonb_build_object('active',true,'phoneSuffix',right(wa_id,4)) into result
 from messaging.whatsapp_connections where user_id=current_user_id;
 return coalesce(result,'{"active":false}'::jsonb);
end $$;

create function public.whatsapp_settings(operation text default 'status', pairing_hash text default null) returns jsonb
language sql security invoker set search_path='' as $$ select messaging.whatsapp_settings(operation,pairing_hash); $$;
revoke all on function messaging.whatsapp_settings(text,text), public.whatsapp_settings(text,text) from public, anon;
grant execute on function messaging.whatsapp_settings(text,text), public.whatsapp_settings(text,text) to authenticated;

-- Only the signature-verified webhook can use these operations.
create function messaging.receive_whatsapp(message_id text, sender text, event_at timestamptz, operation text, pairing_hash text) returns boolean
language plpgsql security definer set search_path='' as $$
declare pairing messaging.whatsapp_pairings%rowtype;
begin
 if message_id is null or length(message_id) not between 1 and 200 or sender is null or sender !~ '^[1-9][0-9]{6,14}$'
  or event_at is null or event_at>clock_timestamp()+interval '5 minutes' or event_at<clock_timestamp()-interval '15 minutes'
  or operation is null or operation not in ('bind','stop') then return false; end if;
 perform pg_catalog.pg_advisory_xact_lock(690069);
 delete from messaging.whatsapp_receipts receipt where receipt.message_id in (
  select r.message_id from messaging.whatsapp_receipts r where created_at<clock_timestamp()-interval '1 day' limit 1000
 );
 insert into messaging.whatsapp_receipts(message_id) values(receive_whatsapp.message_id) on conflict do nothing;
 if not found then return false; end if;
 if operation='stop' then
  delete from messaging.whatsapp_connections where wa_id=sender and date_trunc('second',verified_at)<=event_at;
  return found;
 end if;
 select * into pairing from messaging.whatsapp_pairings p where p.token_hash=pairing_hash
  and consumed_at is null and expires_at>clock_timestamp() and date_trunc('second',created_at)<=event_at;
 if not found then return false; end if;
 if exists(select 1 from messaging.whatsapp_connections where wa_id=sender or user_id=pairing.user_id) then return false; end if;
 if not exists(select 1 from auth.users where id=pairing.user_id and email_confirmed_at is not null and not coalesce(is_anonymous,false)) then return false; end if;
 insert into messaging.whatsapp_connections(user_id,wa_id,consent_at) values(pairing.user_id,sender,pairing.created_at);
 update messaging.whatsapp_pairings set consumed_at=clock_timestamp() where token_hash=pairing.token_hash;
 return true;
end $$;
create function public.receive_whatsapp(message_id text, sender text, event_at timestamptz, operation text, pairing_hash text default null) returns boolean
language sql security invoker set search_path='' as $$ select messaging.receive_whatsapp(message_id,sender,event_at,operation,pairing_hash); $$;
create function messaging.whatsapp_recipient(target_user_id uuid) returns text
language sql stable security definer set search_path='' as $$ select wa_id from messaging.whatsapp_connections where user_id=target_user_id; $$;
create function public.whatsapp_recipient(target_user_id uuid) returns text
language sql stable security invoker set search_path='' as $$ select messaging.whatsapp_recipient(target_user_id); $$;
revoke all on function messaging.receive_whatsapp(text,text,timestamptz,text,text), public.receive_whatsapp(text,text,timestamptz,text,text),
 messaging.whatsapp_recipient(uuid), public.whatsapp_recipient(uuid) from public, anon, authenticated;
grant execute on function messaging.receive_whatsapp(text,text,timestamptz,text,text), public.receive_whatsapp(text,text,timestamptz,text,text),
 messaging.whatsapp_recipient(uuid), public.whatsapp_recipient(uuid) to service_role;

alter table public.notification_deliveries drop constraint notification_deliveries_channel_check;
alter table public.notification_deliveries add constraint notification_deliveries_channel_check check (channel in ('email','push','whatsapp'));
alter table public.activity_events drop constraint activity_events_channel_check;
alter table public.activity_events add constraint activity_events_channel_check check (channel is null or channel in ('email','push','whatsapp','sms','in_app'));

-- Freeze one message per recipient/person at the same boundary as the outbox.
-- Delivery never evaluates invitations or scheduling rules.
create table messaging.whatsapp_invitations (
 id uuid primary key default gen_random_uuid(),
 outbox_id uuid not null references public.notification_outbox(id) on delete cascade,
 invitation_id uuid not null references public.invitations(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 message jsonb not null,
 expires_at timestamptz not null,
 activity_generation bigint not null,
 provider_message_id text,
 last_response_at timestamptz,
 unique(outbox_id,invitation_id)
);
alter table messaging.whatsapp_invitations enable row level security;
revoke all on messaging.whatsapp_invitations from public,anon,authenticated;
create index whatsapp_invitations_invitation_idx on messaging.whatsapp_invitations(invitation_id);
create index whatsapp_invitations_user_idx on messaging.whatsapp_invitations(user_id);

create function messaging.snapshot_whatsapp_invitations() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.type not in ('activity_invitation','invitation_reminder') then return new; end if;
 insert into messaging.whatsapp_invitations(outbox_id,invitation_id,user_id,message,expires_at,activity_generation)
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
  and exists(select 1 from messaging.whatsapp_connections c where c.user_id=new.user_id)
  and (p.user_id=new.user_id or exists(select 1 from public.person_guardians g where g.person_id=p.id and g.guardian_user_id=new.user_id))
  and (new.type<>'invitation_reminder' or i.response='pending');
 return new;
end $$;
revoke all on function messaging.snapshot_whatsapp_invitations() from public,anon,authenticated;
create trigger snapshot_whatsapp_invitations after insert on public.notification_outbox
 for each row execute function messaging.snapshot_whatsapp_invitations();

create function messaging.whatsapp_invitation_messages(target_outbox_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'message',message,'providerMessageId',provider_message_id) order by id),'[]'::jsonb)
 from messaging.whatsapp_invitations where outbox_id=target_outbox_id;
$$;
create function public.whatsapp_invitation_messages(target_outbox_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select messaging.whatsapp_invitation_messages(target_outbox_id); $$;
create function messaging.record_whatsapp_invitation(target_message_id uuid, provider_id text) returns void
language sql security definer set search_path='' as $$
 update messaging.whatsapp_invitations set provider_message_id=provider_id where id=target_message_id and provider_message_id is null;
$$;
create function public.record_whatsapp_invitation(target_message_id uuid, provider_id text) returns void
language sql security invoker set search_path='' as $$ select messaging.record_whatsapp_invitation(target_message_id,provider_id); $$;

create function messaging.respond_whatsapp(message_id text,sender text,event_at timestamptz,reply_id uuid,answer text) returns text
language plpgsql security definer set search_path='' as $$
declare target messaging.whatsapp_invitations%rowtype; connected uuid; activity public.activities%rowtype; invitation public.invitations%rowtype;
begin
 if message_id is null or length(message_id) not between 1 and 200 or sender is null or sender !~ '^[1-9][0-9]{6,14}$'
  or event_at is null or event_at>clock_timestamp()+interval '5 minutes' or event_at<clock_timestamp()-interval '15 minutes'
  or answer is null or answer not in ('accepted','declined') then return null; end if;
 perform pg_catalog.pg_advisory_xact_lock(690069);
 insert into messaging.whatsapp_receipts(message_id) values(respond_whatsapp.message_id) on conflict do nothing;
 if not found then return null; end if;
 select user_id into connected from messaging.whatsapp_connections where wa_id=sender;
 select * into target from messaging.whatsapp_invitations where id=reply_id and user_id=connected;
 if not found then return 'unavailable'; end if;
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
  or event_at<target.last_response_at or date_trunc('second',invitation.responded_at)>event_at then return 'unavailable'; end if;
 if not exists(select 1 from public.people p where p.id=invitation.person_id and p.user_id=connected)
  and not exists(select 1 from public.person_guardians g where g.person_id=invitation.person_id and g.guardian_user_id=connected)
 then return 'unavailable'; end if;
 -- Preserve comments; the ordinary triggers also publish response-change events.
 if invitation.response is distinct from answer then
  update public.invitations set response=answer,responded_at=clock_timestamp() where id=target.invitation_id;
 end if;
 update messaging.whatsapp_invitations set last_response_at=event_at where id=reply_id;
 return answer;
end $$;
create function public.respond_whatsapp(message_id text,sender text,event_at timestamptz,reply_id uuid,answer text) returns text
language sql security invoker set search_path='' as $$ select messaging.respond_whatsapp(message_id,sender,event_at,reply_id,answer); $$;
revoke all on function messaging.whatsapp_invitation_messages(uuid),public.whatsapp_invitation_messages(uuid),
 messaging.record_whatsapp_invitation(uuid,text),public.record_whatsapp_invitation(uuid,text),
 messaging.respond_whatsapp(text,text,timestamptz,uuid,text),public.respond_whatsapp(text,text,timestamptz,uuid,text)
 from public,anon,authenticated;
grant execute on function messaging.whatsapp_invitation_messages(uuid),public.whatsapp_invitation_messages(uuid),
 messaging.record_whatsapp_invitation(uuid,text),public.record_whatsapp_invitation(uuid,text),
 messaging.respond_whatsapp(text,text,timestamptz,uuid,text),public.respond_whatsapp(text,text,timestamptz,uuid,text) to service_role;

-- Bounded cleanup; expired button snapshots follow the existing 90-day outbox
-- retention via cascading deletes. No phone history is retained after opt-out.
create function messaging.prune_whatsapp_proofs() returns void
language plpgsql security definer set search_path='' as $$
begin
 delete from messaging.whatsapp_pairings where token_hash in (
  select token_hash from messaging.whatsapp_pairings where created_at<clock_timestamp()-interval '1 day' order by created_at limit 10000
 );
 delete from messaging.whatsapp_receipts where message_id in (
  select message_id from messaging.whatsapp_receipts where created_at<clock_timestamp()-interval '1 day' order by created_at limit 10000
 );
end $$;
revoke all on function messaging.prune_whatsapp_proofs() from public,anon,authenticated;
select cron.schedule('forena-whatsapp-proof-prune','0 * * * *',$cron$select messaging.prune_whatsapp_proofs()$cron$);
