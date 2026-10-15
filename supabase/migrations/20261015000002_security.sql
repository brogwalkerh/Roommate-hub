-- Roommate Hub: Row-Level Security, grants, storage policies, realtime.
-- Rule of thumb: confirmed members (public.is_member()) can read and write
-- shared household data; nobody else can see anything.

------------------------------------------------------------------------------
-- Enable RLS everywhere
------------------------------------------------------------------------------

alter table public.household enable row level security;
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.calendar_feeds enable row level security;
alter table public.feed_events enable row level security;
alter table public.reminders enable row level security;
alter table public.reminder_completions enable row level security;
alter table public.notes enable row level security;
alter table public.recurring_bills enable row level security;
alter table public.bills enable row level security;
alter table public.bill_shares enable row level security;
alter table public.settlements enable row level security;
alter table public.files enable row level security;
alter table public.push_subscriptions enable row level security;

-- The anonymous role never touches app tables.
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;
revoke all on all sequences in schema public from anon;

------------------------------------------------------------------------------
-- Household and profiles
------------------------------------------------------------------------------

create policy "members read household" on public.household
  for select to authenticated using ((select public.is_member()));
create policy "members update household" on public.household
  for update to authenticated using ((select public.is_member())) with check ((select public.is_member()));

create policy "members read profiles" on public.profiles
  for select to authenticated using ((select public.is_member()));
create policy "members update own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) and (select public.is_member()))
  with check (id = (select auth.uid()));
-- Profiles are created by the signup trigger only.
revoke insert, delete on public.profiles from authenticated;

------------------------------------------------------------------------------
-- Shared household tables: members have full access
------------------------------------------------------------------------------

create policy "members all events" on public.events
  for all to authenticated using ((select public.is_member())) with check ((select public.is_member()));
create policy "members all reminders" on public.reminders
  for all to authenticated using ((select public.is_member())) with check ((select public.is_member()));
create policy "members all reminder completions" on public.reminder_completions
  for all to authenticated using ((select public.is_member())) with check ((select public.is_member()));
create policy "members all notes" on public.notes
  for all to authenticated using ((select public.is_member())) with check ((select public.is_member()));
create policy "members all recurring bills" on public.recurring_bills
  for all to authenticated using ((select public.is_member())) with check ((select public.is_member()));
create policy "members all bills" on public.bills
  for all to authenticated using ((select public.is_member())) with check ((select public.is_member()));
create policy "members all bill shares" on public.bill_shares
  for all to authenticated using ((select public.is_member())) with check ((select public.is_member()));
create policy "members all settlements" on public.settlements
  for all to authenticated using ((select public.is_member())) with check ((select public.is_member()));
create policy "members all files" on public.files
  for all to authenticated using ((select public.is_member())) with check ((select public.is_member()));

------------------------------------------------------------------------------
-- Calendar feeds: the url column is write-only for clients
------------------------------------------------------------------------------

create policy "members all calendar feeds" on public.calendar_feeds
  for all to authenticated using ((select public.is_member())) with check ((select public.is_member()));
revoke select on public.calendar_feeds from authenticated;
grant select (id, name, kind, url_hint, color, owner_id, privacy, last_synced_at, last_error, created_by, created_at)
  on public.calendar_feeds to authenticated;

-- Feed events are written only by the sync function (service role).
create policy "members read feed events" on public.feed_events
  for select to authenticated using ((select public.is_member()));
revoke insert, update, delete on public.feed_events from authenticated;

------------------------------------------------------------------------------
-- Push subscriptions: each person manages only their own devices
------------------------------------------------------------------------------

create policy "own push subscriptions" on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_member()))
  with check (user_id = (select auth.uid()) and (select public.is_member()));

------------------------------------------------------------------------------
-- RPCs callable by members
------------------------------------------------------------------------------

grant execute on function public.complete_reminder(uuid) to authenticated;
grant execute on function public.undo_complete_reminder(uuid) to authenticated;
grant execute on function public.save_bill(uuid, text, text, bigint, public.split_type, date, date, uuid, text, text, jsonb) to authenticated;
grant execute on function public.next_occurrence(timestamptz, public.repeat_rule, timestamptz, text) to authenticated;
-- Lets the Bills page create a new recurring bill's first instance right away.
grant execute on function public.generate_recurring_bills() to authenticated;
revoke all on function public.enforce_signup_allowlist() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;

------------------------------------------------------------------------------
-- Storage: private "household" bucket, members only
------------------------------------------------------------------------------

create policy "members read household files" on storage.objects
  for select to authenticated
  using (bucket_id = 'household' and (select public.is_member()));
create policy "members upload household files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'household' and (select public.is_member()));
create policy "members update household files" on storage.objects
  for update to authenticated
  using (bucket_id = 'household' and (select public.is_member()))
  with check (bucket_id = 'household' and (select public.is_member()));
create policy "members delete household files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'household' and (select public.is_member()));

------------------------------------------------------------------------------
-- Realtime: push row changes to the other roommate's screen
------------------------------------------------------------------------------

alter publication supabase_realtime add table
  public.events,
  public.feed_events,
  public.reminders,
  public.notes,
  public.bills,
  public.bill_shares,
  public.settlements,
  public.recurring_bills,
  public.files,
  public.profiles,
  public.household;
