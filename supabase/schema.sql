-- STARTIT schema. Run in the Supabase SQL editor once.

-- One workspace per founder. `data` is end-to-end encrypted in the browser (AES-256-GCM,
-- lib/vault.ts) before it's saved, so it holds ciphertext only: nobody with database access,
-- including STARTIT, can read it. `reminders` holds content-free facts (due dates and counts)
-- so the daily job can send generic reminders without decrypting anything.
create table if not exists public.workspaces (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  data       jsonb not null,
  reminders  jsonb,
  updated_at timestamptz not null default now()
);
alter table public.workspaces add column if not exists reminders jsonb;

alter table public.workspaces enable row level security;

-- Founders can only ever see and change their own workspace.
drop policy if exists "own workspace" on public.workspaces;
create policy "own workspace" on public.workspaces
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- The email on a workspace is where reminders go. It always comes from the signed-in account,
-- whatever a client sends, so nobody can point STARTIT's emails at someone else.
create or replace function public.workspaces_owner_email() returns trigger
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is not null then
    new.email := (select u.email from auth.users u where u.id = auth.uid());
  end if;
  return new;
end;
$$;
revoke all on function public.workspaces_owner_email() from public, anon, authenticated;
drop trigger if exists workspaces_owner_email on public.workspaces;
create trigger workspaces_owner_email before insert or update on public.workspaces
  for each row execute function public.workspaces_owner_email();

-- Which reminders went out, so the daily job never sends the same one twice.
create table if not exists public.notification_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind    text not null,           -- e.g. 'overdue', 'checkin', 'quiet', 'partner'
  day     date not null,
  channel text not null,           -- 'email' | 'push'
  primary key (user_id, kind, day, channel)
);

alter table public.notification_log enable row level security;
-- No policies: only the server (service role key) reads or writes this table.

-- Devices that turned on push notifications (Web Push). One founder can have several.
create table if not exists public.push_subscriptions (
  endpoint   text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
-- No policies: written by /api/push/subscribe and read by the reminder job with the service role key.

-- ------------------------------------------------------------------ billing --

-- One row per founder. Written only by the payment webhooks (service role).
create table if not exists public.subscriptions (
  user_id           uuid primary key references auth.users (id) on delete cascade,
  plan              text not null default 'garage',    -- 'garage' | 'launch' | 'scale'
  status            text not null,                     -- provider status (active, canceled, …)
  provider          text not null,                     -- 'stripe' | 'razorpay'
  provider_customer text,
  provider_sub      text unique,
  period_end        timestamptz,
  updated_at        timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
drop policy if exists "read own subscription" on public.subscriptions;
create policy "read own subscription" on public.subscriptions for select using (auth.uid() = user_id);

-- ------------------------------------------------------------- usage limits --

create table if not exists public.usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null default current_date,
  kind    text not null,              -- 'chat' | 'search' | 'research' | 'plan'
  count   int  not null default 0,
  primary key (user_id, day, kind)
);
alter table public.usage enable row level security;
drop policy if exists "read own usage" on public.usage;
create policy "read own usage" on public.usage for select using (auth.uid() = user_id);

-- Spend one unit of today's quota in a single atomic step, so parallel requests can't overshoot.
create or replace function public.use_quota(p_user uuid, p_kind text, p_limit int)
returns table (allowed boolean, used int)
language plpgsql
security definer
set search_path = public
as $$
declare
  c int;
begin
  if p_limit <= 0 then
    return query select false, 0;
    return;
  end if;
  insert into usage (user_id, day, kind, count)
  values (p_user, current_date, p_kind, 1)
  on conflict (user_id, day, kind)
  do update set count = usage.count + 1 where usage.count < p_limit
  returning usage.count into c;

  if c is null then
    select u.count into c from usage u where u.user_id = p_user and u.day = current_date and u.kind = p_kind;
    return query select false, coalesce(c, p_limit);
  else
    return query select true, c;
  end if;
end;
$$;

-- Only the server (service role) may spend quota; signed-in users can't call it directly.
revoke all on function public.use_quota(uuid, text, int) from public, anon, authenticated;

-- ------------------------------------------------------------- security --

-- Every sign-in step (code sent, code checked, authenticator, backup code), for rate limiting,
-- account lockout and the security log. IPs are stored only as a keyed hash. Kept 30 days.
create table if not exists public.auth_events (
  id       bigserial primary key,
  at       timestamptz not null default now(),
  action   text not null,          -- 'otp_send' | 'otp_verify' | 'mfa_verify' | 'backup_code'
  ok       boolean not null,
  account  text,                   -- lower-cased email, when known
  ip_hash  text not null,
  detail   text
);
create index if not exists auth_events_ip on public.auth_events (action, ip_hash, at desc);
create index if not exists auth_events_account on public.auth_events (action, account, at desc);
alter table public.auth_events enable row level security;
-- No policies: only the server (service role) reads or writes this table.

-- Two-step verification backup codes: salted HMACs only, each usable once.
create table if not exists public.mfa_backup_codes (
  id        bigserial primary key,
  user_id   uuid not null references auth.users (id) on delete cascade,
  salt      text not null,
  code_hash text not null,
  used_at   timestamptz
);
create index if not exists mfa_backup_codes_user on public.mfa_backup_codes (user_id);
alter table public.mfa_backup_codes enable row level security;
-- No policies: only the server (service role) reads or writes this table.

-- If an account has an authenticator app, its data can only be reached from a session that
-- completed two-step verification (aal2), even with a valid sign-in token.
create or replace function public.mfa_satisfied() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified');
$$;

drop policy if exists "require 2fa" on public.workspaces;
create policy "require 2fa" on public.workspaces as restrictive for all to authenticated using (public.mfa_satisfied()) with check (public.mfa_satisfied());
drop policy if exists "require 2fa" on public.subscriptions;
create policy "require 2fa" on public.subscriptions as restrictive for select to authenticated using (public.mfa_satisfied());
drop policy if exists "require 2fa" on public.usage;
create policy "require 2fa" on public.usage as restrictive for select to authenticated using (public.mfa_satisfied());
