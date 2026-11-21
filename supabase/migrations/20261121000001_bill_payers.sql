-- Bills: who pays the bill, and who has paid their share.
--
-- Before this, a bill only counted on the balance once someone marked it paid,
-- and there was no record of the other person paying their share back.
-- Now every bill has a payer (the person who pays the provider). From the
-- moment a bill exists, the other person's share is owed to the payer. Paying
-- a share back is a settlement linked to the bill (settlements.bill_id).

------------------------------------------------------------------------------
-- Schema
------------------------------------------------------------------------------

alter table public.bills
  add column payer_id uuid references public.profiles (id) on delete set null;

-- Existing bills: the person who paid it, else the person who added it.
update public.bills set payer_id = coalesce(paid_by, created_by) where payer_id is null;

alter table public.settlements
  add column bill_id uuid references public.bills (id) on delete cascade;
create index settlements_bill_idx on public.settlements (bill_id);
-- One payment per person per bill: "Sam paid his share" can't be recorded twice.
create unique index settlements_bill_from_uniq on public.settlements (bill_id, from_user)
  where bill_id is not null;

-- Utilities split into electric, water and gas so the icons make sense.
update public.bills set category = 'water'
  where category = 'utilities' and title ilike '%water%';
update public.bills set category = 'electric'
  where category = 'utilities' and (title ilike '%electric%' or title ilike '%power%');
update public.bills set category = 'gas'
  where category = 'utilities' and title ilike '%gas%';
update public.recurring_bills set category = 'water'
  where category = 'utilities' and title ilike '%water%';
update public.recurring_bills set category = 'electric'
  where category = 'utilities' and (title ilike '%electric%' or title ilike '%power%');
update public.recurring_bills set category = 'gas'
  where category = 'utilities' and title ilike '%gas%';

------------------------------------------------------------------------------
-- save_bill with a payer
------------------------------------------------------------------------------

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
  p_shares jsonb,
  p_payer_id uuid)
returns public.bills
language plpgsql
set search_path = ''
as $$
declare
  b public.bills;
  total bigint;
  payer uuid := coalesce(p_paid_by, p_payer_id);
begin
  select coalesce(sum((s ->> 'share_cents')::bigint), 0) into total
    from jsonb_array_elements(p_shares) s;
  if total <> p_amount_cents then
    raise exception 'shares_mismatch: shares add up to % but the bill is %', total, p_amount_cents
      using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.bills (title, category, amount_cents, split, due_on, paid_on, paid_by, payer_id, notes, receipt_path)
    values (p_title, coalesce(p_category, 'other'), p_amount_cents, p_split, p_due_on, p_paid_on, p_paid_by, payer,
            p_notes, p_receipt_path)
    returning * into b;
  else
    update public.bills set
      title = p_title, category = coalesce(p_category, 'other'), amount_cents = p_amount_cents,
      split = p_split, due_on = p_due_on, paid_on = p_paid_on, paid_by = p_paid_by, payer_id = payer,
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
grant execute on function public.save_bill(uuid, text, text, bigint, public.split_type, date, date, uuid, text, text, jsonb, uuid)
  to authenticated;

-- The old signature keeps the previous app build working until the new one is
-- deployed: a bill saved without a payer is owed to whoever marked it paid.
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
language sql
set search_path = ''
as $$
  select public.save_bill(p_id, p_title, p_category, p_amount_cents, p_split, p_due_on, p_paid_on, p_paid_by,
                          p_notes, p_receipt_path, p_shares, p_paid_by);
$$;

------------------------------------------------------------------------------
-- Recurring bills: the template's usual payer becomes the bill's payer
------------------------------------------------------------------------------

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
  share_total bigint;
  member_count int;
  i int;
begin
  -- Members may call this; the scheduler calls it with no user at all.
  if auth.uid() is not null and not public.is_member() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  -- One run at a time, so two runs can't both create the same bill.
  perform pg_advisory_xact_lock(hashtext('public.generate_recurring_bills'));

  select timezone into tz from public.household where id = 1;
  today := (now() at time zone tz)::date;

  for rb in select * from public.recurring_bills where active for update loop
    -- Check this month and next month.
    for i in 0..1 loop
      month_start := (date_trunc('month', today) + make_interval(months => i))::date;
      continue when rb.last_generated_month is not null and month_start <= rb.last_generated_month;
      due := month_start + (least(rb.day_of_month,
               extract(day from (month_start + interval '1 month' - interval '1 day'))::int) - 1);
      continue when due < today or due - rb.lead_days > today;

      insert into public.bills (title, category, amount_cents, split, due_on, recurring_bill_id, created_by, payer_id)
      values (rb.title, rb.category, rb.amount_cents, rb.split, due, rb.id, rb.created_by,
              (select p.id from public.profiles p where p.id = rb.default_payer))
      on conflict (recurring_bill_id, due_on) where recurring_bill_id is not null do nothing
      returning * into new_bill;

      if new_bill.id is not null then
        select coalesce(sum((s ->> 'share_cents')::bigint), 0) into share_total
          from jsonb_array_elements(rb.shares) s
          where exists (select 1 from public.profiles p where p.id = (s ->> 'user_id')::uuid);

        if share_total = rb.amount_cents then
          insert into public.bill_shares (bill_id, user_id, share_cents, percent)
          select new_bill.id, (s ->> 'user_id')::uuid, (s ->> 'share_cents')::bigint, (s ->> 'percent')::numeric
          from jsonb_array_elements(rb.shares) s
          where exists (select 1 from public.profiles p where p.id = (s ->> 'user_id')::uuid);
        else
          -- Someone on the template no longer has an account: split equally
          -- among current members, extra cents to the earliest members.
          select count(*) into member_count from public.profiles;
          insert into public.bill_shares (bill_id, user_id, share_cents, percent)
          select new_bill.id, p.id,
                 rb.amount_cents / member_count
                   + case when p.rn <= rb.amount_cents % member_count then 1 else 0 end,
                 null
          from (select id, row_number() over (order by created_at, id) as rn from public.profiles) p;
          update public.bills set split = 'equal' where id = new_bill.id;
        end if;
        created := created + 1;
      end if;

      update public.recurring_bills set last_generated_month = month_start where id = rb.id;
      rb.last_generated_month := month_start;
      new_bill := null;
    end loop;
  end loop;
  return created;
end;
$$;

------------------------------------------------------------------------------
-- What each person owes on each bill
------------------------------------------------------------------------------

-- One row per share that somebody other than the payer owes: who owes whom how
-- much for which bill, how much of it they have paid back so far and when. Shares
-- of the payer, bills with no payer and $0 shares never appear.
create view public.bill_debts
with (security_invoker = true)
as
select
  b.id as bill_id,
  b.title,
  b.due_on,
  b.paid_on,
  b.created_at,
  coalesce(b.paid_by, b.payer_id) as payer_id,
  s.user_id,
  s.share_cents,
  coalesce((
    select sum(st.amount_cents) from public.settlements st
    where st.bill_id = b.id and st.from_user = s.user_id
  ), 0)::bigint as paid_cents,
  (
    select max(st.paid_on) from public.settlements st
    where st.bill_id = b.id and st.from_user = s.user_id
  ) as paid_back_on
from public.bills b
join public.bill_shares s on s.bill_id = b.id
where coalesce(b.paid_by, b.payer_id) is not null
  and s.user_id <> coalesce(b.paid_by, b.payer_id)
  and s.share_cents > 0;
grant select on public.bill_debts to authenticated;

-- Net position per member: positive = is owed money, negative = owes money.
-- Every share owed to a payer counts from the day the bill is added; payments
-- between roommates (settlements, linked to a bill or not) move it back.
create or replace view public.balances
with (security_invoker = true)
as
with ledger as (
  select d.payer_id as user_id, d.share_cents as delta from public.bill_debts d
  union all
  select d.user_id, -d.share_cents from public.bill_debts d
  union all
  select st.from_user, st.amount_cents from public.settlements st
  union all
  select st.to_user, -st.amount_cents from public.settlements st
)
select p.id as user_id, coalesce(sum(l.delta), 0)::bigint as net_cents
from public.profiles p
left join ledger l on l.user_id = p.id
group by p.id;
