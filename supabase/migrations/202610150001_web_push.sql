-- No changes to existing notebooks or auth policies. These tables are server-only.
create table if not exists public.web_push_subscriptions (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users(id) on delete cascade,
    endpoint_hash text not null unique check (length(endpoint_hash) = 64),
    subscription jsonb not null,
    time_zone text not null,
    language text not null check (language in ('ru', 'en')),
    enabled_at timestamptz not null default now(),
    expires_at timestamptz not null,
    last_checked_at timestamptz not null default '1970-01-01'
);
alter table public.web_push_subscriptions enable row level security;
revoke all on public.web_push_subscriptions from anon, authenticated;
grant all on public.web_push_subscriptions to service_role;
create index if not exists web_push_owner on public.web_push_subscriptions(owner_id);
create table if not exists public.web_push_deliveries (
    subscription_id uuid not null references public.web_push_subscriptions(id) on delete cascade,
    entry_id text not null,
    remind_at timestamptz not null,
    state text not null default 'pending' check (state in ('pending', 'sent', 'cancelled')),
    attempts integer not null default 1,
    lease_token uuid not null,
    locked_until timestamptz,
    next_attempt_at timestamptz not null default now(),
    primary key (subscription_id, entry_id, remind_at)
);
alter table public.web_push_deliveries enable row level security;
revoke all on public.web_push_deliveries from anon, authenticated;
grant all on public.web_push_deliveries to service_role;
create or replace function public.claim_web_push_delivery(p_subscription uuid, p_entry text, p_at timestamptz, p_token uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare claimed uuid;
begin
    insert into public.web_push_deliveries(subscription_id, entry_id, remind_at, lease_token, locked_until)
    values (p_subscription, p_entry, p_at, p_token, now() + interval '2 minutes')
    on conflict (subscription_id, entry_id, remind_at) do update
    set state = 'pending', attempts = public.web_push_deliveries.attempts + 1,
        lease_token = excluded.lease_token, locked_until = excluded.locked_until
    where public.web_push_deliveries.state in ('pending', 'cancelled')
      and public.web_push_deliveries.attempts < 5
      and public.web_push_deliveries.next_attempt_at <= now()
      and (public.web_push_deliveries.locked_until is null or public.web_push_deliveries.locked_until < now())
    returning lease_token into claimed;
    return coalesce(claimed = p_token, false);
end;
$$;
revoke all on function public.claim_web_push_delivery(uuid,text,timestamptz,uuid) from public, anon, authenticated;
grant execute on function public.claim_web_push_delivery(uuid,text,timestamptz,uuid) to service_role;

create or replace function public.limit_web_push_devices()
returns trigger language plpgsql set search_path = '' as $$
begin
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.owner_id::text, 0));
    if (select count(*) from public.web_push_subscriptions where owner_id = new.owner_id) >= 20 then
        raise exception 'Device limit reached';
    end if;
    return new;
end;
$$;
drop trigger if exists web_push_device_limit on public.web_push_subscriptions;
create trigger web_push_device_limit before insert on public.web_push_subscriptions
for each row execute function public.limit_web_push_devices();
revoke all on function public.limit_web_push_devices() from public, anon, authenticated;
