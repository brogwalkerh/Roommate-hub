-- Invite your roommate from Settings. A member asks for a code for an email;
-- the code is returned once and only its bcrypt hash is stored, in the same
-- allowlist row that enforce_signup_allowlist checks and clears at signup.

-- 16 characters from an alphabet without 0/O/1/I, in groups of four.
create or replace function public.create_invite(p_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
  v_code text := '';
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
begin
  if not public.is_member() then
    raise exception 'not_member' using errcode = '42501';
  end if;
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or char_length(v_email) > 254 then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  if exists (select 1 from auth.users u where lower(u.email) = v_email) then
    raise exception 'already_registered' using errcode = '23505';
  end if;
  if (select count(*) from public.profiles) >= 2 then
    raise exception 'household_full' using errcode = 'P0001';
  end if;

  for i in 1..16 loop
    v_code := v_code || substr(alphabet, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % 32), 1);
    if i in (4, 8, 12) then
      v_code := v_code || '-';
    end if;
  end loop;

  insert into public.allowed_emails (email, code_hash)
  values (v_email, extensions.crypt(v_code, extensions.gen_salt('bf')))
  on conflict (email) do update set code_hash = excluded.code_hash;

  return v_code;
end;
$$;

-- Emails with a live (unused) invite code.
create or replace function public.pending_invites()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select a.email
  from public.allowed_emails a
  where public.is_member()
    and a.code_hash is not null
    and not exists (select 1 from auth.users u where lower(u.email) = a.email)
  order by a.email;
$$;

-- Make a pending code useless. The email row stays; without a code it can't sign up.
create or replace function public.revoke_invite(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_member() then
    raise exception 'not_member' using errcode = '42501';
  end if;
  update public.allowed_emails set code_hash = null
  where email = lower(trim(p_email))
    and not exists (select 1 from auth.users u where lower(u.email) = allowed_emails.email);
end;
$$;

revoke all on function public.create_invite(text) from public, anon;
revoke all on function public.pending_invites() from public, anon;
revoke all on function public.revoke_invite(text) from public, anon;
grant execute on function public.create_invite(text) to authenticated;
grant execute on function public.pending_invites() to authenticated;
grant execute on function public.revoke_invite(text) to authenticated;
