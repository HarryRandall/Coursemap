-- One row per Compass reply. Students read their own rows for the usage page,
-- and the chat route sums recent rows to enforce the daily allowance. Rows are
-- append-only for students so the allowance cannot be reset by deleting them,
-- and the non-negative checks mean a hand-written row can only add usage.
create table public.assistant_usage (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users(id) on delete cascade,
    chat_id uuid not null,
    model text not null check (char_length(model) between 1 and 160),
    input_tokens integer not null default 0 check (input_tokens >= 0),
    cached_input_tokens integer not null default 0 check (cached_input_tokens >= 0),
    output_tokens integer not null default 0 check (output_tokens >= 0),
    cost_usd numeric(12, 8) not null default 0 check (cost_usd >= 0),
    tool_calls smallint not null default 0 check (tool_calls >= 0),
    latency_ms integer not null default 0 check (latency_ms >= 0),
    created_at timestamptz not null default now()
);
create index assistant_usage_owner_created_idx on public.assistant_usage(owner_id, created_at desc);
alter table public.assistant_usage enable row level security;
revoke all on public.assistant_usage from public, anon, authenticated, service_role;
grant select, insert on public.assistant_usage to authenticated;
grant all on public.assistant_usage to service_role;
create policy assistant_usage_owner_select on public.assistant_usage for select to authenticated
    using (owner_id = (select auth.uid()));
create policy assistant_usage_owner_insert on public.assistant_usage for insert to authenticated
    with check (owner_id = (select auth.uid()));
