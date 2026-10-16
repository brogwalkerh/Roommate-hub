-- Roommate Hub: scheduled jobs and function secrets.
-- Requires Vault secrets created once outside migrations (never committed):
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<random string>', 'cron_secret');
--   select vault.create_secret('<VAPID public key>', 'vapid_public_key');
--   select vault.create_secret('<VAPID private key>', 'vapid_private_key');
--   select vault.create_secret('https://<user>.github.io/<repo>/', 'vapid_subject');
-- Edge Functions read them through function_secret() (or an env var of the
-- same name in upper case, which takes precedence).

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

-- Edge Functions (secret key = service_role) read their secrets from Vault here.
create or replace function public.function_secret(p_name text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets
  where name = p_name
    and p_name in ('cron_secret', 'vapid_public_key', 'vapid_private_key', 'vapid_subject');
$$;
revoke all on function public.function_secret(text) from public, anon, authenticated;
grant execute on function public.function_secret(text) to service_role;

select cron.schedule('sync-calendars', '*/30 * * * *', $$select public.call_edge_function('sync-calendars')$$);
select cron.schedule('send-notifications', '*/5 * * * *', $$select public.call_edge_function('send-notifications')$$);
select cron.schedule('generate-recurring-bills', '7 * * * *', $$select public.generate_recurring_bills()$$);
