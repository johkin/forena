-- List only club metadata for platform administration; retain normal organization RLS.
create function administration.system_clubs(search_query text,page_number integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare term text:=btrim(coalesce(search_query,'')); result jsonb;
begin
 if auth.uid() is null or not public.has_platform_role(array['system_admin']) then
  raise exception 'Forbidden' using errcode='42501';
 end if;
 if length(term)>120 or page_number is null or page_number<1 or page_number>10000 then
  raise exception 'Invalid club query' using errcode='22023';
 end if;
 select jsonb_build_object(
  'total',(select count(*) from public.organizations o where position(lower(term) in lower(o.name))>0),
  'clubs',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'slug',p.slug) order by p.name,p.id)
   from (select o.id,o.name,o.slug from public.organizations o
    where position(lower(term) in lower(o.name))>0 order by o.name,o.id limit 30 offset (page_number-1)*30) p),'[]'::jsonb)
 ) into result;
 return result;
end $$;
create function public.system_clubs(search_query text default '',page_number integer default 1) returns jsonb
language sql security invoker set search_path='' as $$ select administration.system_clubs(search_query,page_number); $$;
revoke all on function administration.system_clubs(text,integer),public.system_clubs(text,integer) from public,anon;
grant execute on function administration.system_clubs(text,integer),public.system_clubs(text,integer) to authenticated;
