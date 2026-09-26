-- Run in a NEW dedicated Supabase project. Do not expose service role keys in the frontend.
create extension if not exists pgcrypto;
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  referral_code text unique not null,
  referred_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint not_self_referred check (referred_by is null or referred_by <> id)
);
create table public.reward_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id),
  referred_user_id uuid references public.profiles(id),
  stripe_invoice_id text unique,
  points_delta integer not null,
  reason text not null,
  created_at timestamptz not null default now()
);
create table public.subscriptions (
  user_id uuid primary key references public.profiles(id),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text not null default 'inactive',
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);
create or replace function public.make_profile_on_signup() returns trigger language plpgsql security definer set search_path = '' as $$
declare requested text; inviter uuid;
begin
  requested := upper(trim(coalesce(new.raw_user_meta_data ->> 'referral_code', '')));
  if requested <> '' then
    select id into inviter from public.profiles where referral_code = requested limit 1;
  end if;
  insert into public.profiles(id, referral_code, referred_by)
  values(new.id, upper(substr(replace(new.id::text, '-', ''), 1, 12)), inviter);
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.make_profile_on_signup();

alter table public.profiles enable row level security;
alter table public.reward_ledger enable row level security;
alter table public.subscriptions enable row level security;
create policy "Read own profile" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "Read own rewards" on public.reward_ledger for select to authenticated using (user_id = (select auth.uid()));
create policy "Read own subscription" on public.subscriptions for select to authenticated using (user_id = (select auth.uid()));
-- No client INSERT/UPDATE/DELETE policies: ledger, referrals and subscriptions are server-controlled.
