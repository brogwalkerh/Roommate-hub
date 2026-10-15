-- Roommate Hub: scheduled jobs.
-- Requires two Vault secrets, created once outside migrations (never committed):
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<random string>', 'cron_secret');
-- cron_secret must equal the CRON_SECRET Edge Function secret.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- POST to one of this project's Edge Functions with the shared cron secret.
create or replace function public.call_edge_function(p_name text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_url text;
  secret text;
begin
  select decrypted_secret into base_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'cron_secret';
  if base_url is null or secret is null then
    raise warning 'call_edge_function: Vault secrets project_url and cron_secret are missing';
    return null;
  end if;
  return net.http_post(
    url := base_url || '/functions/v1/' || p_name,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;
revoke all on function public.call_edge_function(text) from public, anon, authenticated;

select cron.schedule('sync-calendars', '*/30 * * * *', $$select public.call_edge_function('sync-calendars')$$);
select cron.schedule('send-notifications', '*/5 * * * *', $$select public.call_edge_function('send-notifications')$$);
select cron.schedule('generate-recurring-bills', '7 * * * *', $$select public.generate_recurring_bills()$$);
