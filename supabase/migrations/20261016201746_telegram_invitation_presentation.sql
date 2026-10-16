-- Preserve recipient scope and frozen local times; add presentation metadata.
create or replace function messaging.snapshot_telegram_invitations() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.type not in ('activity_invitation','invitation_reminder') then return new; end if;
 insert into messaging.telegram_invitations(outbox_id,invitation_id,user_id,message,expires_at,activity_generation)
 select new.id,i.id,new.user_id,jsonb_build_object(
  'discipline',(select d.key from public.disciplines d where d.id=public.resolve_team_discipline(t.id)),
  'category',at.system_category,'activityType',at.name,
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
 join public.activity_types at on at.id=a.activity_type_id and at.organization_id=a.organization_id
 join public.organizations org on org.id=a.organization_id
 where a.id::text=new.payload->>'activityId'
  and coalesce(new.payload->'personIds','[]'::jsonb) @> jsonb_build_array(i.person_id)
  and exists(select 1 from messaging.telegram_connections c where c.user_id=new.user_id)
  and (p.user_id=new.user_id or exists(select 1 from public.person_guardians g where g.person_id=p.id and g.guardian_user_id=new.user_id))
  and (new.type<>'invitation_reminder' or i.response='pending');
 return new;
end $$;

-- Keep legacy text for deployments running the previous webhook handler.
create or replace function messaging.telegram_reply_message(reply_id uuid,sender text) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('message',m.message,'text',left('Kallelse för '||(m.message->>'person')||E'\nLag: '||(m.message->>'team')||E'\nAktivitet: '||(m.message->>'activity')||E'\nNär: '||(m.message->>'when')||E'\nPlats: '||(m.message->>'location')||E'\nSamling: '||(m.message->>'gathering')||E'\nSvara senast: '||(m.message->>'due'),3500),'url',m.message->>'url')
 from messaging.telegram_invitations m join messaging.telegram_connections c on c.user_id=m.user_id where m.id=reply_id and c.telegram_id=sender;
$$;
