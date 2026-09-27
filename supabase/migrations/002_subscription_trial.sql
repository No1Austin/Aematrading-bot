-- Apply after 001_auth_referrals.sql. Review existing production data first.
-- Trial starts at account creation, not at first login or migration.
alter table public.subscriptions
  add column if not exists trial_ends_at timestamptz;

-- Existing subscribers: retain their current paid status; use original signup date.
insert into public.subscriptions (user_id, status, trial_ends_at)
select p.id, 'inactive', p.created_at + interval '7 days'
from public.profiles p
on conflict (user_id) do update
  set trial_ends_at = coalesce(
    public.subscriptions.trial_ends_at,
    excluded.trial_ends_at
  );

-- Every new profile gets a subscription row with a fixed trial expiry.
create or replace function public.initialize_subscription_on_profile()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.subscriptions(user_id, status, trial_ends_at)
  values (new.id, 'inactive', new.created_at + interval '7 days')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_profile_created_initialize_subscription on public.profiles;
create trigger on_profile_created_initialize_subscription
after insert on public.profiles
for each row execute function public.initialize_subscription_on_profile();

-- Only the server (service role) should decide access. Client SELECT policy
-- in 001_auth_referrals.sql is retained for display only.
create index if not exists subscriptions_trial_ends_at_idx
on public.subscriptions (trial_ends_at);
