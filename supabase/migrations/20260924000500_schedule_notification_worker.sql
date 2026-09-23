create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $migration$
begin
  if not exists (
    select 1 from vault.secrets where name = 'forena_notification_worker_token'
  ) then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'forena_notification_worker_token',
      'Token used by pg_cron to invoke the Förena notification Edge Function'
    );
  end if;

  if not exists (
    select 1 from vault.secrets where name = 'forena_project_url'
  ) then
    perform vault.create_secret(
      'https://ejpixhukpiaohtypzgty.supabase.co',
      'forena_project_url',
      'Supabase project URL used by scheduled Edge Function invocations'
    );
  end if;
end
$migration$;

create or replace function public.authorize_notification_worker(provided_token text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select provided_token is not null
    and length(provided_token) > 0
    and provided_token = (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'forena_notification_worker_token'
      limit 1
    );
$$;

revoke all on function public.authorize_notification_worker(text) from public, anon, authenticated;
grant execute on function public.authorize_notification_worker(text) to service_role;

do $schedule$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'forena-notification-worker'
  limit 1;

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;

  perform cron.schedule(
    'forena-notification-worker',
    '* * * * *',
    $cron$
      select net.http_post(
        url := (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'forena_project_url'
          limit 1
        ) || '/functions/v1/notification-worker',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-forena-cron-token', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'forena_notification_worker_token'
            limit 1
          )
        ),
        body := jsonb_build_object('scheduledAt', now())
      );
    $cron$
  );
end
$schedule$;
