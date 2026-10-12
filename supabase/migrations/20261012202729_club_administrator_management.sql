-- Private invitation records, reachable only through authorized commands.
create table administration.club_admin_invites (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 email text not null check (email=lower(btrim(email)) and length(email)<=254 and email like '%@%'),
 token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
 invited_by uuid not null references auth.users(id),
 status text not null default 'pending' check(status in ('pending','accepted','cancelled','failed')),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '7 days',
 sent_at timestamptz,
 accepted_by uuid references auth.users(id),
 accepted_at timestamptz,
 check ((status='accepted' and accepted_by is not null and accepted_at is not null) or (status<>'accepted' and accepted_by is null and accepted_at is null))
);
alter table administration.club_admin_invites enable row level security;
revoke all on administration.club_admin_invites from public,anon,authenticated;
create unique index club_admin_invites_pending_email on administration.club_admin_invites(organization_id,email) where status='pending';

create function administration.system_club_admins(target uuid,operation text,payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare club public.organizations%rowtype; subject uuid; invite uuid; address text; result jsonb;
begin
 if auth.uid() is null or not public.has_platform_role(array['system_admin']) then raise exception 'Forbidden' using errcode='42501'; end if;
 select * into club from public.organizations where id=target for update;
 if not found then raise exception 'Club not found' using errcode='P0002'; end if;
 if jsonb_typeof(payload) is distinct from 'object' then raise exception 'Invalid command' using errcode='22023'; end if;
 if operation='list' then
  return jsonb_build_object('administrators',coalesce((select jsonb_agg(jsonb_build_object('userId',m.user_id,'email',u.email,'role',m.role) order by u.email,m.user_id) from public.organization_members m join auth.users u on u.id=m.user_id where m.organization_id=target and m.role in ('owner','admin')),'[]'::jsonb),
   'invitations',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'email',i.email,'status',case when i.status='pending' and i.expires_at<=now() then 'expired' else i.status end,'expiresAt',i.expires_at,'sent',i.sent_at is not null) order by i.created_at desc,i.id) from administration.club_admin_invites i where i.organization_id=target and i.status in ('pending','failed')),'[]'::jsonb));
 elsif operation='self' then
  if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception 'Verified email required' using errcode='42501'; end if;
  insert into public.organization_members(organization_id,user_id,role) values(target,auth.uid(),'admin') on conflict(organization_id,user_id) do update set role=case when organization_members.role='owner' then 'owner' else 'admin' end;
  subject:=auth.uid();
 elsif operation='remove' then
  subject:=(payload->>'userId')::uuid;
  update public.organization_members set role='member' where organization_id=target and user_id=subject and role in ('owner','admin');
  if not found then raise exception 'Administrator not found' using errcode='P0002'; end if;
  -- Cancel any outstanding invitation so it cannot silently restore this role.
  update administration.club_admin_invites set status='cancelled' where organization_id=target and status='pending' and email=(select lower(email) from auth.users where id=subject);
 elsif operation='invite' then
  address:=lower(btrim(payload->>'email'));
  if address is null or length(address)>254 or address !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or payload->>'tokenHash' is null or payload->>'tokenHash' !~ '^[a-f0-9]{64}$' then raise exception 'Invalid invitation' using errcode='22023'; end if;
  if exists(select 1 from public.organization_members m join auth.users u on u.id=m.user_id where m.organization_id=target and m.role in ('owner','admin') and lower(u.email)=address) then raise exception 'Already administrator' using errcode='55000'; end if;
  update administration.club_admin_invites set status='cancelled' where organization_id=target and email=address and status='pending';
  insert into administration.club_admin_invites(organization_id,email,token_hash,invited_by) values(target,address,payload->>'tokenHash',auth.uid()) returning id into invite;
  result:=jsonb_build_object('invitationId',invite,'clubName',club.name);
 elsif operation='cancel' then
  invite:=(payload->>'invitationId')::uuid;
  update administration.club_admin_invites set status='cancelled' where id=invite and organization_id=target and status in ('pending','failed');
  if not found then raise exception 'Invitation not found' using errcode='P0002'; end if;
 elsif operation='delivery' then
  invite:=(payload->>'invitationId')::uuid;
  if jsonb_typeof(payload->'sent') is distinct from 'boolean' then raise exception 'Invalid delivery state' using errcode='22023'; end if;
  update administration.club_admin_invites set sent_at=case when (payload->>'sent')::boolean then now() else null end,status=case when (payload->>'sent')::boolean then 'pending' else 'failed' end where id=invite and organization_id=target and status='pending';
  return '{}'::jsonb;
 else raise exception 'Invalid command' using errcode='22023';
 end if;
 insert into public.audit_log(organization_id,actor_user_id,action,entity_type,entity_id,details) values(target,auth.uid(),'club_admin.'||operation,'organization',target::text,jsonb_build_object('userId',subject,'invitationId',invite));
 return coalesce(result,'{}'::jsonb);
end $$;

create function administration.accept_club_admin_invite(invitation_token_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare invitation administration.club_admin_invites%rowtype; address text; club_slug text; target uuid;
begin
 if auth.uid() is null then raise exception 'Forbidden' using errcode='42501'; end if;
 select lower(email) into address from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if address is null then raise exception 'Verified email required' using errcode='42501'; end if;
 -- Lock club before invitation, the same order as management/cancellation commands.
 select organization_id into target from administration.club_admin_invites where token_hash=invitation_token_hash;
 select slug into club_slug from public.organizations where id=target for update;
 select * into invitation from administration.club_admin_invites where token_hash=invitation_token_hash and organization_id=target for update;
 if not found or invitation.status<>'pending' or invitation.expires_at<=now() or invitation.email<>address
 or not exists(select 1 from public.platform_roles where user_id=invitation.invited_by and role='system_admin') then raise exception 'Invalid invitation' using errcode='22023'; end if;
 insert into public.organization_members(organization_id,user_id,role) values(target,auth.uid(),'admin') on conflict(organization_id,user_id) do update set role=case when organization_members.role='owner' then 'owner' else 'admin' end;
 update administration.club_admin_invites set status='accepted',accepted_at=now(),accepted_by=auth.uid() where id=invitation.id;
 insert into public.audit_log(organization_id,actor_user_id,action,entity_type,entity_id,details) values(target,auth.uid(),'club_admin.accepted','organization',target::text,jsonb_build_object('invitationId',invitation.id));
 return jsonb_build_object('slug',club_slug);
end $$;
create function public.system_club_admins(target uuid,operation text default 'list',payload jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select administration.system_club_admins(target,operation,payload); $$;
create function public.accept_club_admin_invite(invitation_token_hash text) returns jsonb
language sql security invoker set search_path='' as $$ select administration.accept_club_admin_invite(invitation_token_hash); $$;
revoke all on function administration.system_club_admins(uuid,text,jsonb),administration.accept_club_admin_invite(text),public.system_club_admins(uuid,text,jsonb),public.accept_club_admin_invite(text) from public,anon;
grant execute on function administration.system_club_admins(uuid,text,jsonb),administration.accept_club_admin_invite(text),public.system_club_admins(uuid,text,jsonb),public.accept_club_admin_invite(text) to authenticated;

create function administration.club_admin_invite_context(invitation_token_hash text) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('clubName',o.name,'expiresAt',i.expires_at)
 from administration.club_admin_invites i join public.organizations o on o.id=i.organization_id
 join auth.users u on u.id=auth.uid() and u.email_confirmed_at is not null and lower(u.email)=i.email
 where i.token_hash=invitation_token_hash and i.status='pending' and i.expires_at>now()
 and exists(select 1 from public.platform_roles where user_id=i.invited_by and role='system_admin');
$$;
create function public.club_admin_invite_context(invitation_token_hash text) returns jsonb
language sql security invoker set search_path='' as $$ select administration.club_admin_invite_context(invitation_token_hash); $$;
revoke all on function administration.club_admin_invite_context(text),public.club_admin_invite_context(text) from public,anon;
grant execute on function administration.club_admin_invite_context(text),public.club_admin_invite_context(text) to authenticated;
