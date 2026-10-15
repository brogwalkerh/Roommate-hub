-- Roommate Hub: core schema.
-- Every table is locked by Row-Level Security to confirmed household members.
-- Signups are limited to emails in public.allowed_emails (rows are added
-- directly in the database, never in a committed file).

------------------------------------------------------------------------------
-- Helpers
------------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

------------------------------------------------------------------------------
-- Allowlist, household, profiles
------------------------------------------------------------------------------

create table public.allowed_emails (
  email text primary key check (email = lower(email) and position('@' in email) > 1)
);
alter table public.allowed_emails enable row level security;
-- No policies: clients can never read or write the allowlist.

create table public.household (
  id smallint primary key default 1 check (id = 1),
  name text not null default 'Our place' check (char_length(name) between 1 and 60),
  timezone text not null default 'America/Los_Angeles',
  updated_at timestamptz not null default now()
);
insert into public.household (id) values (1);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  color text not null default '#2c5ea6' check (color ~ '^#[0-9a-fA-F]{6}$'),
  notify_reminders boolean not null default true,
  notify_bills boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger household_updated_at before update on public.household
  for each row execute function public.set_updated_at();

-- True when the caller is a confirmed household member.
create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.id = auth.uid()
      and u.email_confirmed_at is not null
  );
$$;
revoke all on function public.is_member() from public, anon;
grant execute on function public.is_member() to authenticated, service_role;

-- Reject signups from emails that are not on the allowlist.
create or replace function public.enforce_signup_allowlist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null
     or not exists (select 1 from public.allowed_emails a where a.email = lower(new.email)) then
    raise exception 'signup_not_allowed: % is not on the household allowlist', coalesce(new.email, '(no email)')
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger enforce_signup_allowlist
  before insert on auth.users
  for each row execute function public.enforce_signup_allowlist();

-- Give every new user a profile with a distinct default color.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  palette text[] := array['#2c5ea6', '#b0452f', '#2b6a5b', '#7a4fa3'];
  taken int;
begin
  select count(*) into taken from public.profiles;
  insert into public.profiles (id, display_name, color)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1)),
    palette[(taken % array_length(palette, 1)) + 1]
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

------------------------------------------------------------------------------
-- Schedule
------------------------------------------------------------------------------

create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  notes text,
  location text,
  owner_id uuid references public.profiles (id) on delete set null, -- null = household event
  all_day boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  start_date date,
  end_date date, -- exclusive, like iCalendar
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_time_shape check (
    (all_day and start_date is not null and end_date is not null and end_date > start_date
       and starts_at is null and ends_at is null)
    or
    (not all_day and starts_at is not null and ends_at is not null and ends_at >= starts_at
       and start_date is null and end_date is null)
  )
);
create index events_starts_at_idx on public.events (starts_at);
create index events_start_date_idx on public.events (start_date);
create trigger events_updated_at before update on public.events
  for each row execute function public.set_updated_at();

create type public.feed_kind as enum ('airbnb', 'ical');
create type public.feed_privacy as enum ('details', 'busy');

-- External calendars (Airbnb export link, personal Google/iCloud/Outlook links).
-- The url column is write-only for clients: it holds a secret token.
create table public.calendar_feeds (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  kind public.feed_kind not null,
  url text not null check (url ~* '^(https|webcal)://'),
  url_hint text,
  color text not null default '#d9534f' check (color ~ '^#[0-9a-fA-F]{6}$'),
  owner_id uuid references public.profiles (id) on delete cascade, -- null = household (Airbnb)
  privacy public.feed_privacy not null default 'details',
  last_synced_at timestamptz,
  last_error text,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create or replace function public.calendar_feeds_url_hint()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.url is distinct from old.url then
    new.url := regexp_replace(new.url, '^webcal://', 'https://', 'i');
    new.url_hint := substring(new.url from '^https?://([^/?#]+)') || ' ...' || right(new.url, 4);
    new.last_synced_at := null;
    new.last_error := null;
  end if;
  return new;
end;
$$;
create trigger calendar_feeds_url_hint before insert or update on public.calendar_feeds
  for each row execute function public.calendar_feeds_url_hint();

create table public.feed_events (
  id uuid primary key default gen_random_uuid(),
  feed_id uuid not null references public.calendar_feeds (id) on delete cascade,
  uid text not null,
  recurrence_id text not null default '',
  summary text,
  description text,
  location text,
  url text,
  all_day boolean not null,
  starts_at timestamptz,
  ends_at timestamptz,
  start_date date,
  end_date date,
  unique (feed_id, uid, recurrence_id)
);
create index feed_events_starts_at_idx on public.feed_events (starts_at);
create index feed_events_start_date_idx on public.feed_events (start_date);

-- Atomically replace one feed's events. Called only by the sync Edge Function.
create or replace function public.replace_feed_events(p_feed_id uuid, p_events jsonb, p_error text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_error is not null then
    update public.calendar_feeds set last_error = p_error, last_synced_at = now() where id = p_feed_id;
    return;
  end if;

  delete from public.feed_events where feed_id = p_feed_id;

  insert into public.feed_events
    (feed_id, uid, recurrence_id, summary, description, location, url,
     all_day, starts_at, ends_at, start_date, end_date)
  select p_feed_id, e.uid, coalesce(e.recurrence_id, ''), e.summary, e.description, e.location, e.url,
         e.all_day, e.starts_at, e.ends_at, e.start_date, e.end_date
  from jsonb_to_recordset(p_events) as e(
    uid text, recurrence_id text, summary text, description text, location text, url text,
    all_day boolean, starts_at timestamptz, ends_at timestamptz, start_date date, end_date date)
  on conflict (feed_id, uid, recurrence_id) do nothing;

  update public.calendar_feeds set last_error = null, last_synced_at = now() where id = p_feed_id;
end;
$$;
revoke all on function public.replace_feed_events(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.replace_feed_events(uuid, jsonb, text) to service_role;

------------------------------------------------------------------------------
-- Reminders
------------------------------------------------------------------------------

create type public.repeat_rule as enum ('none', 'daily', 'weekly', 'biweekly', 'monthly');

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  notes text,
  due_at timestamptz not null,
  repeat public.repeat_rule not null default 'none',
  repeat_anchor timestamptz not null default now(), -- first due time; repeats are counted from here
  assignee_id uuid references public.profiles (id) on delete set null, -- null = both of you
  completed_at timestamptz,
  completed_by uuid references public.profiles (id) on delete set null,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reminders_open_due_idx on public.reminders (due_at) where completed_at is null;
create trigger reminders_updated_at before update on public.reminders
  for each row execute function public.set_updated_at();

-- A manual change to due_at or the repeat rule restarts the schedule from due_at.
create or replace function public.reminders_sync_anchor()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.repeat_anchor := new.due_at;
  elsif (new.due_at is distinct from old.due_at or new.repeat is distinct from old.repeat)
        and coalesce(current_setting('app.completing_reminder', true), '') <> 'on' then
    new.repeat_anchor := new.due_at;
  end if;
  return new;
end;
$$;
create trigger reminders_sync_anchor before insert or update on public.reminders
  for each row execute function public.reminders_sync_anchor();

create table public.reminder_completions (
  id uuid primary key default gen_random_uuid(),
  reminder_id uuid not null references public.reminders (id) on delete cascade,
  due_at timestamptz not null,
  completed_at timestamptz not null default now(),
  completed_by uuid default auth.uid() references public.profiles (id) on delete set null
);
create index reminder_completions_reminder_idx on public.reminder_completions (reminder_id, completed_at desc);

-- Next repeat strictly after p_after, counted from the anchor in the household
-- time zone so 9:00 stays 9:00 across daylight-saving changes and monthly
-- repeats on the 31st land on the last day of shorter months.
create or replace function public.next_occurrence(
  p_anchor timestamptz, p_repeat public.repeat_rule, p_after timestamptz, p_tz text)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  step interval;
  local_anchor timestamp := p_anchor at time zone p_tz;
  k int;
  candidate timestamptz;
begin
  if p_repeat = 'none' then
    return null;
  end if;
  step := case p_repeat
    when 'daily' then interval '1 day'
    when 'weekly' then interval '7 days'
    when 'biweekly' then interval '14 days'
    when 'monthly' then interval '1 month'
  end;
  -- Jump close to the answer, then step forward.
  if p_repeat = 'monthly' then
    k := greatest(1, (extract(year from age(p_after, p_anchor)) * 12 + extract(month from age(p_after, p_anchor)))::int);
  else
    k := greatest(1, floor(extract(epoch from (p_after - p_anchor)) / extract(epoch from step))::int);
  end if;
  loop
    candidate := (local_anchor + k * step) at time zone p_tz;
    exit when candidate > p_after;
    k := k + 1;
  end loop;
  -- Step back if the estimate overshot by more than one repeat.
  while k > 1 and ((local_anchor + (k - 1) * step) at time zone p_tz) > p_after loop
    k := k - 1;
    candidate := (local_anchor + k * step) at time zone p_tz;
  end loop;
  return candidate;
end;
$$;

-- Mark a reminder done. Repeating reminders move to their next due time.
create or replace function public.complete_reminder(p_id uuid)
returns public.reminders
language plpgsql
set search_path = ''
as $$
declare
  r public.reminders;
  tz text;
begin
  select * into r from public.reminders where id = p_id for update;
  if not found then
    raise exception 'reminder_not_found' using errcode = 'P0002';
  end if;

  insert into public.reminder_completions (reminder_id, due_at) values (r.id, r.due_at);

  if r.repeat = 'none' then
    update public.reminders
      set completed_at = now(), completed_by = auth.uid()
      where id = r.id
      returning * into r;
  else
    select timezone into tz from public.household where id = 1;
    perform set_config('app.completing_reminder', 'on', true);
    update public.reminders
      set due_at = public.next_occurrence(r.repeat_anchor, r.repeat, greatest(now(), r.due_at), tz),
          completed_at = null,
          completed_by = null
      where id = r.id
      returning * into r;
    perform set_config('app.completing_reminder', 'off', true);
  end if;
  return r;
end;
$$;

-- Undo the most recent completion of a reminder.
create or replace function public.undo_complete_reminder(p_id uuid)
returns public.reminders
language plpgsql
set search_path = ''
as $$
declare
  c public.reminder_completions;
  r public.reminders;
begin
  select * into c from public.reminder_completions
    where reminder_id = p_id order by completed_at desc limit 1;
  if not found then
    raise exception 'nothing_to_undo' using errcode = 'P0002';
  end if;
  perform set_config('app.completing_reminder', 'on', true);
  update public.reminders
    set due_at = c.due_at, completed_at = null, completed_by = null
    where id = p_id
    returning * into r;
  perform set_config('app.completing_reminder', 'off', true);
  delete from public.reminder_completions where id = c.id;
  return r;
end;
$$;

------------------------------------------------------------------------------
-- Notes
------------------------------------------------------------------------------

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  title text not null default '' check (char_length(title) <= 200),
  body text not null default '' check (char_length(body) <= 100000),
  pinned boolean not null default false,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  updated_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notes_updated_at_idx on public.notes (pinned desc, updated_at desc);

create or replace function public.notes_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
create trigger notes_touch before update on public.notes
  for each row execute function public.notes_touch();

------------------------------------------------------------------------------
-- Bills (all money in integer cents)
------------------------------------------------------------------------------

create type public.split_type as enum ('equal', 'exact', 'percent');

create table public.recurring_bills (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  category text not null default 'other',
  amount_cents bigint not null check (amount_cents > 0),
  split public.split_type not null default 'equal',
  shares jsonb not null default '[]', -- [{"user_id": uuid, "share_cents": int, "percent": number|null}]
  day_of_month smallint not null check (day_of_month between 1 and 31),
  default_payer uuid references public.profiles (id) on delete set null,
  lead_days smallint not null default 7 check (lead_days between 0 and 28),
  active boolean not null default true,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger recurring_bills_updated_at before update on public.recurring_bills
  for each row execute function public.set_updated_at();

create table public.bills (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  category text not null default 'other',
  amount_cents bigint not null check (amount_cents > 0),
  split public.split_type not null default 'equal',
  due_on date,
  paid_on date,
  paid_by uuid references public.profiles (id) on delete set null,
  notes text,
  receipt_path text,
  recurring_bill_id uuid references public.recurring_bills (id) on delete set null,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bills_paid_shape check ((paid_on is null) = (paid_by is null))
);
create index bills_due_on_idx on public.bills (due_on);
create index bills_paid_on_idx on public.bills (paid_on);
create unique index bills_recurring_due_uniq on public.bills (recurring_bill_id, due_on)
  where recurring_bill_id is not null;
create trigger bills_updated_at before update on public.bills
  for each row execute function public.set_updated_at();

create table public.bill_shares (
  bill_id uuid not null references public.bills (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  share_cents bigint not null check (share_cents >= 0),
  percent numeric(5, 2) check (percent is null or (percent >= 0 and percent <= 100)),
  primary key (bill_id, user_id)
);
create index bill_shares_user_idx on public.bill_shares (user_id);

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references public.profiles (id) on delete cascade,
  to_user uuid not null references public.profiles (id) on delete cascade,
  amount_cents bigint not null check (amount_cents > 0),
  paid_on date not null default current_date,
  note text,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (from_user <> to_user)
);

-- Create or update a bill and its shares in one transaction.
-- p_shares: [{"user_id": uuid, "share_cents": int, "percent": number|null}]
create or replace function public.save_bill(
  p_id uuid,
  p_title text,
  p_category text,
  p_amount_cents bigint,
  p_split public.split_type,
  p_due_on date,
  p_paid_on date,
  p_paid_by uuid,
  p_notes text,
  p_receipt_path text,
  p_shares jsonb)
returns public.bills
language plpgsql
set search_path = ''
as $$
declare
  b public.bills;
  total bigint;
begin
  select coalesce(sum((s ->> 'share_cents')::bigint), 0) into total
    from jsonb_array_elements(p_shares) s;
  if total <> p_amount_cents then
    raise exception 'shares_mismatch: shares add up to % but the bill is %', total, p_amount_cents
      using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.bills (title, category, amount_cents, split, due_on, paid_on, paid_by, notes, receipt_path)
    values (p_title, coalesce(p_category, 'other'), p_amount_cents, p_split, p_due_on, p_paid_on, p_paid_by, p_notes, p_receipt_path)
    returning * into b;
  else
    update public.bills set
      title = p_title, category = coalesce(p_category, 'other'), amount_cents = p_amount_cents,
      split = p_split, due_on = p_due_on, paid_on = p_paid_on, paid_by = p_paid_by,
      notes = p_notes, receipt_path = p_receipt_path
    where id = p_id
    returning * into b;
    if not found then
      raise exception 'bill_not_found' using errcode = 'P0002';
    end if;
    delete from public.bill_shares where bill_id = b.id;
  end if;

  insert into public.bill_shares (bill_id, user_id, share_cents, percent)
  select b.id, (s ->> 'user_id')::uuid, (s ->> 'share_cents')::bigint, (s ->> 'percent')::numeric
  from jsonb_array_elements(p_shares) s;

  return b;
end;
$$;

-- Net position per member: positive = is owed money, negative = owes money.
create view public.balances
with (security_invoker = true)
as
with ledger as (
  select b.paid_by as user_id, b.amount_cents as delta
    from public.bills b where b.paid_on is not null and b.paid_by is not null
  union all
  select s.user_id, -s.share_cents
    from public.bill_shares s join public.bills b on b.id = s.bill_id
    where b.paid_on is not null
  union all
  select st.from_user, st.amount_cents from public.settlements st
  union all
  select st.to_user, -st.amount_cents from public.settlements st
)
select p.id as user_id, coalesce(sum(l.delta), 0)::bigint as net_cents
from public.profiles p
left join ledger l on l.user_id = p.id
group by p.id;

-- Create the upcoming bill for each active recurring bill, lead_days before it
-- is due. Safe to run repeatedly. Run daily by pg_cron.
create or replace function public.generate_recurring_bills()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  rb public.recurring_bills;
  tz text;
  today date;
  month_start date;
  due date;
  created int := 0;
  new_bill public.bills;
  i int;
begin
  select timezone into tz from public.household where id = 1;
  today := (now() at time zone tz)::date;

  for rb in select * from public.recurring_bills where active loop
    -- Check this month and next month.
    for i in 0..1 loop
      month_start := (date_trunc('month', today) + make_interval(months => i))::date;
      due := month_start + (least(rb.day_of_month,
               extract(day from (month_start + interval '1 month' - interval '1 day'))::int) - 1);
      if due >= today and due - rb.lead_days <= today
         and not exists (select 1 from public.bills where recurring_bill_id = rb.id and due_on = due) then
        insert into public.bills (title, category, amount_cents, split, due_on, recurring_bill_id, created_by)
        values (rb.title, rb.category, rb.amount_cents, rb.split, due, rb.id, rb.created_by)
        returning * into new_bill;

        if jsonb_array_length(rb.shares) > 0 then
          insert into public.bill_shares (bill_id, user_id, share_cents, percent)
          select new_bill.id, (s ->> 'user_id')::uuid, (s ->> 'share_cents')::bigint, (s ->> 'percent')::numeric
          from jsonb_array_elements(rb.shares) s
          where exists (select 1 from public.profiles p where p.id = (s ->> 'user_id')::uuid);
        end if;
        created := created + 1;
      end if;
    end loop;
  end loop;
  return created;
end;
$$;
revoke all on function public.generate_recurring_bills() from public, anon, authenticated;
grant execute on function public.generate_recurring_bills() to service_role;

------------------------------------------------------------------------------
-- Files
------------------------------------------------------------------------------

create table public.files (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  name text not null check (char_length(name) between 1 and 255),
  folder text not null default '' check (char_length(folder) <= 120),
  size_bytes bigint not null default 0,
  mime_type text,
  uploaded_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index files_folder_idx on public.files (folder, created_at desc);

insert into storage.buckets (id, name, public, file_size_limit)
values ('household', 'household', false, 52428800)
on conflict (id) do nothing;

------------------------------------------------------------------------------
-- Push notifications
------------------------------------------------------------------------------

-- One row per notification sent, so each reminder, bill or guest arrival is
-- announced once. Keys look like 'reminder:<id>:<due_at>'. Service role only.
create table public.notification_log (
  key text primary key,
  sent_at timestamptz not null default now()
);
alter table public.notification_log enable row level security;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
