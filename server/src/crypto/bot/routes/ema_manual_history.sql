-- EMA crypto research-only, user-owned manual outcome history.
-- Run in Supabase SQL editor. Independent tables to avoid assuming prior migration column names.
create table if not exists public.ema_manual_signal_history (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 source_monitor_id text not null,
 symbol text not null,
 direction text not null check (direction in ('BULL','BEAR')),
 strategy text,
 signal_snapshot jsonb not null default '{}'::jsonb,
 outcome text not null check (outcome in ('WIN','LOSS','BREAKEVEN','NOT_TAKEN')),
 actual_entry numeric,
 actual_exit numeric,
 net_pnl_usd numeric,
 occurred_at timestamptz not null,
 notes text,
 source text not null default 'USER_REPORTED' check (source = 'USER_REPORTED'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(user_id, source_monitor_id)
);
create index if not exists ema_manual_signal_history_user_created_idx on public.ema_manual_signal_history(user_id, created_at desc);
alter table public.ema_manual_signal_history enable row level security;
revoke all on public.ema_manual_signal_history from anon;
grant select, insert, update on public.ema_manual_signal_history to authenticated;
drop policy if exists ema_history_select_own on public.ema_manual_signal_history;
create policy ema_history_select_own on public.ema_manual_signal_history for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists ema_history_insert_own on public.ema_manual_signal_history;
create policy ema_history_insert_own on public.ema_manual_signal_history for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists ema_history_update_own on public.ema_manual_signal_history;
create policy ema_history_update_own on public.ema_manual_signal_history for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
