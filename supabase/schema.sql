-- STARTIT schema. Run in the Supabase SQL editor once.

-- One workspace per founder. The whole app state is stored as JSON so the frontend
-- and database never drift; split into tables later if you need cross-user queries.
create table if not exists public.workspaces (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.workspaces enable row level security;

-- Founders can only ever see and change their own workspace.
drop policy if exists "own workspace" on public.workspaces;
create policy "own workspace" on public.workspaces
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

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
