-- Only the secret-verified webhook may resolve Telegram identities. Application
-- reads use a short-lived authenticated JWT and the existing RLS, never service_role.
create function messaging.telegram_assistant_identity(sender text, event_at timestamptz) returns uuid
language sql stable security definer set search_path='' as $$
 select c.user_id from messaging.telegram_connections c join auth.users u on u.id=c.user_id
 where c.telegram_id=sender and date_trunc('second',c.verified_at)<=event_at
 and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
 and (u.banned_until is null or u.banned_until<=now()) and u.deleted_at is null;
$$;
create function public.telegram_assistant_identity(sender text,event_at timestamptz) returns uuid
language sql stable security invoker set search_path='' as $$
 select messaging.telegram_assistant_identity(sender,event_at);
$$;

create function messaging.claim_telegram_assistant(sender text,event_at timestamptz,message_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid; receipt text; prefix text;
begin
 if sender is null or sender !~ '^[1-9][0-9]{0,15}$' or message_id is null or message_id !~ '^u:[0-9]{1,16}$'
 or event_at is null or event_at>clock_timestamp()+interval '5 seconds' or event_at<clock_timestamp()-interval '10 minutes' then
  return jsonb_build_object('status','ignored');
 end if;
 uid:=messaging.telegram_assistant_identity(sender,event_at);
 if uid is null then return jsonb_build_object('status','unlinked'); end if;
 if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('telegram:assistant:'||uid::text,0)) then
  raise exception 'Telegram assistant busy' using errcode='55P03';
 end if;
 prefix:='ai:'||uid::text||':'; receipt:=prefix||message_id;
 if exists(select 1 from messaging.telegram_receipts r where r.message_id=receipt) then return jsonb_build_object('status','ignored'); end if;
 if (select count(*) from messaging.telegram_receipts r where r.message_id like prefix||'%' and r.created_at>clock_timestamp()-interval '1 minute')>=5
 or (select count(*) from messaging.telegram_receipts r where r.message_id like prefix||'%' and r.created_at>clock_timestamp()-interval '1 hour')>=30 then
  return jsonb_build_object('status','limited');
 end if;
 insert into messaging.telegram_receipts(message_id) values(receipt);
 return jsonb_build_object('status','ready','userId',uid);
end $$;
create function public.claim_telegram_assistant(sender text,event_at timestamptz,message_id text) returns jsonb
language sql security invoker set search_path='' as $$
 select messaging.claim_telegram_assistant(sender,event_at,message_id);
$$;
revoke all on function messaging.telegram_assistant_identity(text,timestamptz),public.telegram_assistant_identity(text,timestamptz),
 messaging.claim_telegram_assistant(text,timestamptz,text),public.claim_telegram_assistant(text,timestamptz,text) from public,anon,authenticated;
grant execute on function messaging.telegram_assistant_identity(text,timestamptz),public.telegram_assistant_identity(text,timestamptz),
 messaging.claim_telegram_assistant(text,timestamptz,text),public.claim_telegram_assistant(text,timestamptz,text) to service_role;
