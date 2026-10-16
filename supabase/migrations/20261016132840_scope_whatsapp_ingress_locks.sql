-- Replace the shared WhatsApp advisory lock without changing RPC grants or RLS.
-- Expired-proof/receipt cleanup remains in the scheduled maintenance job.

create or replace function messaging.whatsapp_settings(operation text, pairing_hash text) returns jsonb
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
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('whatsapp:user:'||current_user_id::text,0));
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
  insert into messaging.whatsapp_pairings(token_hash,user_id) values(pairing_hash,current_user_id);
 elsif operation='disable' then
  delete from messaging.whatsapp_connections where user_id=current_user_id;
  update messaging.whatsapp_pairings set consumed_at=clock_timestamp() where user_id=current_user_id and consumed_at is null;
 end if;
 select jsonb_build_object('active',true,'phoneSuffix',right(wa_id,4)) into result
 from messaging.whatsapp_connections where user_id=current_user_id;
 return coalesce(result,'{"active":false}'::jsonb);
end $$;

-- Meta signatures authenticate the provider, not membership in Förena.
-- Reject irrelevant ingress before locks or receipt writes.
create or replace function messaging.receive_whatsapp(message_id text, sender text, event_at timestamptz, operation text, pairing_hash text) returns boolean
language plpgsql security definer set search_path='' as $$
declare pairing messaging.whatsapp_pairings%rowtype; target_user_id uuid; phone_lock bigint;
begin
 if message_id is null or length(message_id) not between 1 and 200 or sender is null or sender !~ '^[1-9][0-9]{6,14}$'
  or event_at is null or event_at>clock_timestamp()+interval '5 minutes' or event_at<clock_timestamp()-interval '15 minutes'
  or operation is null or operation not in ('bind','stop') then return false; end if;
 if exists(select 1 from messaging.whatsapp_receipts r where r.message_id=receive_whatsapp.message_id) then return false; end if;
 if operation='stop' then
  select c.user_id into target_user_id from messaging.whatsapp_connections c
   where c.wa_id=sender and date_trunc('second',c.verified_at)<=event_at;
  if not found then
   -- A bind may have reserved this phone but not committed its connection yet.
   -- Observe that reservation without taking a lock or storing unknown senders.
   phone_lock:=pg_catalog.hashtextextended('whatsapp:phone:'||sender,0);
   if exists(select 1 from pg_catalog.pg_locks l where l.locktype='advisory' and l.granted
    and l.database=(select oid from pg_catalog.pg_database where datname=current_database())
    and l.pid<>pg_backend_pid() and l.classid=((phone_lock>>32)&4294967295)::oid
    and l.objid=(phone_lock&4294967295)::oid and l.objsubid=1) then
    raise exception 'WhatsApp operation busy' using errcode='55P03';
   end if;
   return false;
  end if;
 else
  select p.* into pairing from messaging.whatsapp_pairings p join auth.users u on u.id=p.user_id
   where p.token_hash=pairing_hash and p.consumed_at is null and p.expires_at>clock_timestamp()
    and date_trunc('second',p.created_at)<=event_at and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false);
  if not found then return false; end if;
  target_user_id:=pairing.user_id;
  if exists(select 1 from messaging.whatsapp_connections c where c.wa_id=sender or c.user_id=target_user_id) then return false; end if;
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('whatsapp:phone:'||sender,0)) then
   raise exception 'WhatsApp operation busy' using errcode='55P03';
  end if;
 end if;
 -- Never queue untrusted ingress on a global or busy account lock. Raising a
 -- retryable failure rolls back the whole operation; the webhook returns 503.
 if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('whatsapp:user:'||target_user_id::text,0)) then
  raise exception 'WhatsApp operation busy' using errcode='55P03';
 end if;
 if operation='stop' then
  -- Recheck after locking: an old opt-out must not delete a newly assigned
  -- connection belonging to another account or a later consent generation.
  if not exists(select 1 from messaging.whatsapp_connections c where c.user_id=target_user_id
   and c.wa_id=sender and date_trunc('second',c.verified_at)<=event_at) then return false; end if;
 else
  select p.* into pairing from messaging.whatsapp_pairings p join auth.users u on u.id=p.user_id
   where p.token_hash=pairing_hash and p.user_id=target_user_id and p.consumed_at is null
    and p.expires_at>clock_timestamp() and date_trunc('second',p.created_at)<=event_at
    and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false);
  if not found then return false; end if;
  if exists(select 1 from messaging.whatsapp_connections c where c.wa_id=sender or c.user_id=target_user_id) then return false; end if;
 end if;
 insert into messaging.whatsapp_receipts(message_id) values(receive_whatsapp.message_id) on conflict do nothing;
 if not found then return false; end if;
 if operation='stop' then
  delete from messaging.whatsapp_connections c where c.user_id=target_user_id and c.wa_id=sender;
 else
  insert into messaging.whatsapp_connections(user_id,wa_id,consent_at) values(target_user_id,sender,pairing.created_at);
  update messaging.whatsapp_pairings p set consumed_at=clock_timestamp() where p.token_hash=pairing.token_hash;
 end if;
 return true;
end $$;

create or replace function messaging.respond_whatsapp(message_id text,sender text,event_at timestamptz,reply_id uuid,answer text) returns text
language plpgsql security definer set search_path='' as $$
declare target messaging.whatsapp_invitations%rowtype; connected uuid; activity public.activities%rowtype; invitation public.invitations%rowtype;
begin
 if message_id is null or length(message_id) not between 1 and 200 or sender is null or sender !~ '^[1-9][0-9]{6,14}$'
  or event_at is null or event_at>clock_timestamp()+interval '5 minutes' or event_at<clock_timestamp()-interval '15 minutes'
  or answer is null or answer not in ('accepted','declined') then return null; end if;
 if exists(select 1 from messaging.whatsapp_receipts r where r.message_id=respond_whatsapp.message_id) then return null; end if;
 select user_id into connected from messaging.whatsapp_connections where wa_id=sender;
 select * into target from messaging.whatsapp_invitations where id=reply_id and user_id=connected;
 if not found then return null; end if;
 if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('whatsapp:user:'||connected::text,0)) then
  raise exception 'WhatsApp operation busy' using errcode='55P03';
 end if;
 -- Revalidate the account-to-number mapping and reference after serialization.
 if not exists(select 1 from messaging.whatsapp_connections c where c.wa_id=sender and c.user_id=connected) then return null; end if;
 select * into target from messaging.whatsapp_invitations where id=reply_id and user_id=connected;
 if not found then return null; end if;
 insert into messaging.whatsapp_receipts(message_id) values(respond_whatsapp.message_id) on conflict do nothing;
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
