-- Availability reveals only a boolean, never another club's metadata.
create function administration.club_slug_available(requested_slug text, target uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Forbidden' using errcode='42501'; end if;
 if target is not null then perform administration.require_club_admin(target); end if;
 if requested_slug is null or requested_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or length(requested_slug)>120 then
  raise exception 'Invalid slug' using errcode='22023';
 end if;
 return not exists(select 1 from public.organizations o where o.slug=requested_slug and (target is null or o.id<>target));
end $$;
create function public.club_slug_available(requested_slug text,target uuid default null) returns boolean
language sql security invoker set search_path='' as $$ select administration.club_slug_available(requested_slug,target); $$;
revoke all on function administration.club_slug_available(text,uuid),public.club_slug_available(text,uuid) from public,anon;
grant execute on function administration.club_slug_available(text,uuid),public.club_slug_available(text,uuid) to authenticated;

-- Existing unique slug constraint remains authoritative, including simultaneous saves.
-- Omitted slug preserves compatibility with older app versions during deployment.
create or replace function administration.save_club_metadata(target uuid,input jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform administration.require_club_admin(target);
 if jsonb_typeof(input) is distinct from 'object' or nullif(btrim(input->>'name'),'') is null or length(input->>'name')>120
 or nullif(btrim(input->>'assistantName'),'') is null or length(input->>'assistantName')>60
 or (input ? 'slug' and (input->>'slug' is null or input->>'slug' !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or length(input->>'slug')>120))
 or not exists(select 1 from pg_catalog.pg_timezone_names where name=input->>'timeZone') then raise exception 'Invalid club' using errcode='22023'; end if;
 update public.organizations set slug=coalesce(input->>'slug',slug),name=btrim(input->>'name'),assistant_name=btrim(input->>'assistantName'),time_zone=input->>'timeZone',updated_at=now() where id=target;
 if not found then raise exception 'Club not found' using errcode='P0002'; end if;
 insert into public.audit_log(organization_id,actor_user_id,action,entity_type,entity_id) values(target,auth.uid(),'organization.metadata_changed','organization',target::text);
end $$;


create table public.discipline_categories (
 key text primary key check (length(key)>0),
 name text not null check (length(btrim(name)) between 1 and 120)
);
alter table public.discipline_categories enable row level security;
revoke all on public.discipline_categories from public,anon,authenticated;
grant select,insert,delete on public.discipline_categories to authenticated;
grant update(name) on public.discipline_categories to authenticated;
create policy "authenticated users can read discipline categories" on public.discipline_categories
 for select to authenticated using (true);
create policy "system admins can create discipline categories" on public.discipline_categories
 for insert to authenticated with check ((select public.has_platform_role(array['system_admin'])));
create policy "system admins can rename discipline categories" on public.discipline_categories
 for update to authenticated using ((select public.has_platform_role(array['system_admin'])))
 with check ((select public.has_platform_role(array['system_admin'])));
create policy "system admins can delete discipline categories" on public.discipline_categories
 for delete to authenticated using ((select public.has_platform_role(array['system_admin'])));
insert into public.discipline_categories(key,name) values
 ('sport','Idrott'),('culture','Kultur'),('outdoor','Friluftsliv'),('game','Spel');
-- Preserve any existing custom category keys; blank strings represented no category.
update public.disciplines set category=null where category is not null and btrim(category)='';
insert into public.discipline_categories(key,name)
 select distinct category,left(category,120) from public.disciplines where category is not null
 on conflict(key) do nothing;
alter table public.disciplines add constraint disciplines_category_fkey
 foreign key(category) references public.discipline_categories(key) on delete restrict;
create index disciplines_category_idx on public.disciplines(category);
