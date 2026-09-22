-- Coursemap baseline, part 1 of 8: identity, roles and permissions
--
-- The two schemas, the private helpers every later part leans on, and the
-- account model. A role is a row, never an email pattern or editable user
-- metadata, and a permission is checked through has_permission so a policy
-- never spells out a role name. Everything here exists before anything that
-- guards itself with it, which is why the shared triggers and the permission
-- lookups are in part 1 rather than beside the tables that use them.

-- Declared rather than assumed. A Supabase project ships pgcrypto, and nothing
-- here needs it now that gen_random_uuid is core, but the schema has always
-- named its own dependency and a stock image is not a guarantee.
create extension if not exists pgcrypto with schema extensions;

-- Supabase hands anon and authenticated everything on each new object in
-- public. Narrow that before the first table exists, so a table added later
-- without a considered grant is unreachable rather than open.
alter default privileges in schema public
  revoke all on tables from anon, authenticated;

alter default privileges in schema public
  revoke all on sequences from anon, authenticated;

alter default privileges in schema public
  revoke execute on functions from public;

create schema if not exists private;

create schema if not exists public;

comment on schema public is 'standard public schema';

create table if not exists private.app_permissions (
    id bigint not null,
    key text not null,
    name text not null,
    created_at timestamp with time zone default now() not null,
    description text not null,
    category text not null,
    constraint app_permissions_category_format_check check ((category ~ '^[a-z][a-z0-9_]*$'::text)),
    constraint app_permissions_description_not_blank_check check ((btrim(description) <> ''::text)),
    constraint app_permissions_key_format_check check ((key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'::text))
);

create table if not exists private.app_roles (
    id bigint not null,
    key text not null,
    name text not null,
    created_at timestamp with time zone default now() not null,
    description text not null,
    constraint app_roles_description_not_blank_check check ((btrim(description) <> ''::text)),
    constraint app_roles_key_format_check check ((key ~ '^[a-z][a-z0-9_]*$'::text))
);

create table if not exists private.role_permissions (
    role_id bigint not null,
    permission_id bigint not null,
    created_at timestamp with time zone default now() not null
);

create table if not exists private.user_roles (
    user_id uuid not null,
    role_id bigint not null,
    granted_by uuid,
    granted_at timestamp with time zone default now() not null
);

create table if not exists public.profiles (
    id uuid not null,
    display_name text not null,
    student_number text,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    email text,
    constraint profiles_display_name_not_blank_check check ((btrim(display_name) <> ''::text)),
    constraint profiles_email_not_blank_check check (((email is null) or (btrim(email) <> ''::text))),
    constraint profiles_student_number_format_check check (((student_number is null) or (student_number ~ '^u[0-9]{7}$'::text)))
);

create table if not exists public.app_settings (
    key text not null,
    value jsonb not null,
    updated_at timestamp with time zone default now() not null,
    updated_by uuid,
    constraint app_settings_key_check check (((key = btrim(key)) and (key <> ''::text) and (length(key) <= 120)))
);

create table if not exists public.import_models (
    id text not null,
    name text not null,
    provider text not null,
    enabled boolean default true not null,
    input_usd_per_million numeric,
    output_usd_per_million numeric,
    pricing_updated_at timestamp with time zone,
    updated_at timestamp with time zone default now() not null,
    visible boolean default true not null,
    constraint import_models_id_check check (((id ~ '^[a-z0-9][a-z0-9._-]*/[a-z0-9][a-z0-9._:-]*$'::text) and (length(id) <= 120))),
    constraint import_models_input_usd_per_million_check check (((input_usd_per_million >= (0)::numeric) and (input_usd_per_million < (1000000)::numeric))),
    constraint import_models_name_check check (((length(btrim(name)) >= 1) and (length(btrim(name)) <= 160))),
    constraint import_models_output_usd_per_million_check check (((output_usd_per_million >= (0)::numeric) and (output_usd_per_million < (1000000)::numeric))),
    constraint import_models_provider_check check (((length(btrim(provider)) >= 1) and (length(btrim(provider)) <= 80)))
);

alter table private.app_permissions ALTER column id add generated always as identity (
    sequence NAME private.app_permissions_id_seq
    START with 1
    INCREMENT by 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

alter table private.app_roles ALTER column id add generated always as identity (
    sequence NAME private.app_roles_id_seq
    START with 1
    INCREMENT by 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

alter table only private.app_permissions
    add constraint app_permissions_key_unique unique (key);

alter table only private.app_permissions
    add constraint app_permissions_pkey primary key (id);

alter table only private.app_roles
    add constraint app_roles_key_unique unique (key);

alter table only private.app_roles
    add constraint app_roles_pkey primary key (id);

alter table only private.role_permissions
    add constraint role_permissions_pkey primary key (role_id, permission_id);

alter table only private.user_roles
    add constraint user_roles_pkey primary key (user_id, role_id);

alter table only private.user_roles
    add constraint user_roles_user_id_unique unique (user_id);

alter table only public.app_settings
    add constraint app_settings_pkey primary key (key);

alter table only public.import_models
    add constraint import_models_pkey primary key (id);

alter table only public.profiles
    add constraint profiles_pkey primary key (id);

alter table only private.role_permissions
    add constraint role_permissions_permission_id_fkey foreign key (permission_id) references private.app_permissions(id) on delete cascade;

alter table only private.role_permissions
    add constraint role_permissions_role_id_fkey foreign key (role_id) references private.app_roles(id) on delete cascade;

alter table only private.user_roles
    add constraint user_roles_granted_by_fkey foreign key (granted_by) references auth.users(id) on delete set null;

alter table only private.user_roles
    add constraint user_roles_role_id_fkey foreign key (role_id) references private.app_roles(id) on delete cascade;

alter table only private.user_roles
    add constraint user_roles_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;

alter table only public.app_settings
    add constraint app_settings_updated_by_fkey foreign key (updated_by) references auth.users(id) on delete set null;

alter table only public.profiles
    add constraint profiles_id_fkey foreign key (id) references auth.users(id) on delete cascade;

create index role_permissions_permission_id_idx on private.role_permissions using btree (permission_id);

create index user_roles_granted_by_idx on private.user_roles using btree (granted_by);

create index user_roles_role_id_idx on private.user_roles using btree (role_id);

create unique index profiles_email_unique_idx on public.profiles using btree (lower(email)) where (email is not null);

create or replace function private.guard_import_model_catalogue() returns trigger
    language plpgsql
    set search_path to ''
    as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(78241309);
  if tg_table_name = 'import_models' then
    if new.id <> old.id then
      raise exception 'The model identifier cannot be changed.' using errcode = '22023';
    end if;
    if not new.enabled and exists (
      select 1 from public.app_settings where key = 'imports.model' and value = to_jsonb(old.id)
    ) then
      raise exception 'Choose another default model before removing this model.' using errcode = '22023';
    end if;
    if not new.visible and exists (
      select 1 from public.app_settings where key = 'imports.model' and value = to_jsonb(old.id)
    ) then
      raise exception 'Choose another default model before hiding this model.' using errcode = '22023';
    end if;
  elsif tg_table_name = 'app_settings' then
    if new.key = 'imports.model' and not exists (
      select 1 from public.import_models where id = new.value #>> '{}' and enabled and visible
    ) then
      raise exception 'Choose an enabled import model.' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.handle_new_user() returns trigger
    language plpgsql security definer
    set search_path to ''
    as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Student'
    )
  )
  on conflict (id) do update
  set email = excluded.email;

  insert into private.user_roles (user_id, role_id, granted_by)
  select new.id, roles.id, null
  from private.app_roles as roles
  where roles.key = 'user'
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create or replace function private.has_permission(required_permission text) returns boolean
    language sql stable security definer
    set search_path to ''
    as $$
  select exists (
    select 1
    from private.user_roles as user_roles
    join private.role_permissions as role_permissions
      on role_permissions.role_id = user_roles.role_id
    join private.app_permissions as permissions
      on permissions.id = role_permissions.permission_id
    where user_roles.user_id = (select auth.uid())
      and permissions.key = required_permission
  );
$$;

create or replace function private.set_updated_at() returns trigger
    language plpgsql
    set search_path to ''
    as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.sync_user_email() returns trigger
    language plpgsql security definer
    set search_path to ''
    as $$
begin
  update public.profiles
  set email = new.email
  where id = new.id;

  return new;
end;
$$;

create or replace function public.current_user_has_permission(required_permission text) returns boolean
    language sql stable
    set search_path to ''
    as $$
  select private.has_permission(required_permission);
$$;

create or replace function public.set_role_permission(p_role_id bigint, p_permission_id bigint, p_enabled boolean) returns boolean
    language plpgsql
    set search_path to ''
    as $$
declare
  target_role_key text;
  target_permission_key text;
begin
  if not (select private.has_permission('admin.access')) then
    raise exception 'Administrator access is required.'
      using errcode = '42501';
  end if;

  select roles.key
  into target_role_key
  from private.app_roles as roles
  where roles.id = p_role_id;

  select permissions.key
  into target_permission_key
  from private.app_permissions as permissions
  where permissions.id = p_permission_id;

  if target_role_key is null or target_permission_key is null then
    raise exception 'The selected role or permission does not exist.'
      using errcode = '22023';
  end if;

  if target_permission_key = 'admin.access' then
    if target_role_key = 'admin' and not p_enabled then
      raise exception 'Administrator access is required for the admin role.'
        using errcode = '22023';
    end if;

    if target_role_key <> 'admin' and p_enabled then
      raise exception 'Administrator access can only be granted by the admin role.'
        using errcode = '22023';
    end if;
  end if;

  if p_enabled then
    insert into private.role_permissions (role_id, permission_id)
    values (p_role_id, p_permission_id)
    on conflict (role_id, permission_id) do nothing;

    return true;
  end if;

  delete from private.role_permissions
  where role_id = p_role_id
    and permission_id = p_permission_id;

  return false;
end;
$$;

create or replace function public.set_user_role(p_user_id uuid, p_role_key text) returns text
    language plpgsql
    set search_path to ''
    as $$
declare
  target_role_id bigint;
  current_role_key text;
  admin_count bigint;
begin
  if not (select private.has_permission('admin.access')) then
    raise exception 'Administrator access is required.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles as profiles
    where profiles.id = p_user_id
  ) then
    raise exception 'The selected user does not exist.'
      using errcode = '22023';
  end if;

  select roles.id
  into target_role_id
  from private.app_roles as roles
  where roles.key = p_role_key
    and roles.key in ('admin', 'user');

  if target_role_id is null then
    raise exception 'The selected role does not exist.'
      using errcode = '22023';
  end if;

  select roles.key
  into current_role_key
  from private.user_roles as user_roles
  join private.app_roles as roles on roles.id = user_roles.role_id
  where user_roles.user_id = p_user_id;

  if current_role_key = p_role_key then
    return p_role_key;
  end if;

  if current_role_key = 'admin' and p_user_id = (select auth.uid()) then
    raise exception 'You cannot remove your own administrator role.'
      using errcode = '22023';
  end if;

  if current_role_key = 'admin' then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('coursemap.admin-role-assignment', 0)
    );

    select count(*)
    into admin_count
    from private.user_roles as user_roles
    join private.app_roles as roles on roles.id = user_roles.role_id
    where roles.key = 'admin';

    if admin_count <= 1 then
      raise exception 'Coursemap must keep at least one administrator.'
        using errcode = '22023';
    end if;
  end if;

  delete from private.user_roles
  where user_id = p_user_id;

  insert into private.user_roles (user_id, role_id, granted_by)
  values (p_user_id, target_role_id, (select auth.uid()));

  return p_role_key;
end;
$$;

comment on function public.current_user_has_permission(required_permission text) is 'Reports whether the authenticated caller has a database-managed application permission.';

comment on function public.set_role_permission(p_role_id bigint, p_permission_id bigint, p_enabled boolean) is 'Grants or removes one role permission while preserving account-role invariants.';

comment on function public.set_user_role(p_user_id uuid, p_role_key text) is 'Sets one database-managed account role after RLS-backed administrator checks.';

create or replace trigger app_settings_set_updated_at before update on public.app_settings for each row execute function private.set_updated_at();

create or replace trigger import_model_default_guard before insert or update on public.app_settings for each row execute function private.guard_import_model_catalogue();

create or replace trigger import_models_guard before update on public.import_models for each row execute function private.guard_import_model_catalogue();

create or replace trigger import_models_updated_at before update on public.import_models for each row execute function private.set_updated_at();

create or replace trigger profiles_set_updated_at before update on public.profiles for each row execute function private.set_updated_at();

alter table private.app_permissions enable row level security;

alter table private.app_roles enable row level security;

alter table private.role_permissions enable row level security;

alter table private.user_roles enable row level security;

alter table public.app_settings enable row level security;

alter table public.import_models enable row level security;

alter table public.profiles enable row level security;

create policy app_permissions_admin_select on private.app_permissions for select to authenticated using (( select private.has_permission('admin.access'::text) as has_permission));

create policy app_roles_admin_select on private.app_roles for select to authenticated using (( select private.has_permission('admin.access'::text) as has_permission));

create policy role_permissions_admin_delete on private.role_permissions for delete to authenticated using (( select private.has_permission('admin.access'::text) as has_permission));

create policy role_permissions_admin_insert on private.role_permissions for insert to authenticated with check (( select private.has_permission('admin.access'::text) as has_permission));

create policy role_permissions_admin_select on private.role_permissions for select to authenticated using (( select private.has_permission('admin.access'::text) as has_permission));

create policy user_roles_admin_delete on private.user_roles for delete to authenticated using (( select private.has_permission('admin.access'::text) as has_permission));

create policy user_roles_admin_insert on private.user_roles for insert to authenticated with check ((( select private.has_permission('admin.access'::text) as has_permission) and (granted_by = ( select auth.uid() as uid))));

create policy user_roles_admin_select on private.user_roles for select to authenticated using (( select private.has_permission('admin.access'::text) as has_permission));

create policy app_settings_import_admin_delete on public.app_settings for delete to authenticated using (( select private.has_permission('imports.manage'::text) as has_permission));

create policy app_settings_import_admin_insert on public.app_settings for insert to authenticated with check (( select private.has_permission('imports.manage'::text) as has_permission));

create policy app_settings_import_admin_read on public.app_settings for select to authenticated using (( select private.has_permission('imports.manage'::text) as has_permission));

create policy app_settings_import_admin_update on public.app_settings for update to authenticated using (( select private.has_permission('imports.manage'::text) as has_permission)) with check (( select private.has_permission('imports.manage'::text) as has_permission));

create policy import_models_insert on public.import_models for insert to authenticated with check (( select private.has_permission('imports.manage'::text) as has_permission));

create policy import_models_read on public.import_models for select to authenticated using (( select private.has_permission('imports.manage'::text) as has_permission));

create policy import_models_update on public.import_models for update to authenticated using (( select private.has_permission('imports.manage'::text) as has_permission)) with check (( select private.has_permission('imports.manage'::text) as has_permission));

create policy profiles_admin_select on public.profiles for select to authenticated using (( select private.has_permission('admin.access'::text) as has_permission));

create policy profiles_owner_select on public.profiles for select to authenticated using ((( select auth.uid() as uid) = id));

create policy profiles_owner_update on public.profiles for update to authenticated using ((( select auth.uid() as uid) = id)) with check ((( select auth.uid() as uid) = id));

comment on table public.app_settings is 'Admin-configured deployment settings, one row per setting key.';

-- The permission model and the settings a fresh installation needs. A role
-- and a permission are rows, so they are seeded here rather than assumed by
-- application code.
INSERT INTO private.app_permissions (id, key, name, created_at, description, category) OVERRIDING SYSTEM VALUE VALUES (1, 'catalogue.read_drafts', 'View draft catalogue', '2026-09-22 10:20:47.476293+00', 'View catalogue records before publication.', 'catalogue');
INSERT INTO private.app_permissions (id, key, name, created_at, description, category) OVERRIDING SYSTEM VALUE VALUES (2, 'catalogue.write', 'Edit catalogue', '2026-09-22 10:20:47.476293+00', 'Create and update catalogue records.', 'catalogue');
INSERT INTO private.app_permissions (id, key, name, created_at, description, category) OVERRIDING SYSTEM VALUE VALUES (3, 'imports.manage', 'Manage imports', '2026-09-22 10:20:47.476293+00', 'Run and review catalogue imports.', 'imports');
INSERT INTO private.app_permissions (id, key, name, created_at, description, category) OVERRIDING SYSTEM VALUE VALUES (4, 'approvals.review', 'Review approvals', '2026-09-22 10:20:47.476293+00', 'Review and resolve student approval requests.', 'approvals');
INSERT INTO private.app_permissions (id, key, name, created_at, description, category) OVERRIDING SYSTEM VALUE VALUES (5, 'admin.access', 'Admin access', '2026-09-22 10:20:47.544588+00', 'Open Coursemap administration pages.', 'admin');
INSERT INTO private.app_permissions (id, key, name, created_at, description, category) OVERRIDING SYSTEM VALUE VALUES (6, 'rooms.manage', 'Manage Room Finder', '2026-09-22 10:20:47.652866+00', 'Create, edit and publish campus maps, floor plans and indoor routes.', 'rooms');
INSERT INTO private.app_permissions (id, key, name, created_at, description, category) OVERRIDING SYSTEM VALUE VALUES (7, 'courses.read_drafts', 'View draft courses', '2026-09-22 10:20:47.95085+00', 'View course records before publication.', 'courses');
INSERT INTO private.app_permissions (id, key, name, created_at, description, category) OVERRIDING SYSTEM VALUE VALUES (8, 'courses.write', 'Edit courses', '2026-09-22 10:20:47.95085+00', 'Create, edit, publish and archive course records.', 'courses');
INSERT INTO private.app_roles (id, key, name, created_at, description) OVERRIDING SYSTEM VALUE VALUES (1, 'admin', 'Admin', '2026-09-22 10:20:47.476293+00', 'Full access to Coursemap administration and catalogue operations.');
INSERT INTO private.app_roles (id, key, name, created_at, description) OVERRIDING SYSTEM VALUE VALUES (2, 'user', 'User', '2026-09-22 10:20:47.562636+00', 'Standard access to Coursemap planning and catalogue features.');
INSERT INTO private.role_permissions (role_id, permission_id, created_at) VALUES (1, 1, '2026-09-22 10:20:47.476293+00');
INSERT INTO private.role_permissions (role_id, permission_id, created_at) VALUES (1, 2, '2026-09-22 10:20:47.476293+00');
INSERT INTO private.role_permissions (role_id, permission_id, created_at) VALUES (1, 3, '2026-09-22 10:20:47.476293+00');
INSERT INTO private.role_permissions (role_id, permission_id, created_at) VALUES (1, 4, '2026-09-22 10:20:47.476293+00');
INSERT INTO private.role_permissions (role_id, permission_id, created_at) VALUES (1, 5, '2026-09-22 10:20:47.544588+00');
INSERT INTO private.role_permissions (role_id, permission_id, created_at) VALUES (2, 1, '2026-09-22 10:20:47.562636+00');
INSERT INTO private.role_permissions (role_id, permission_id, created_at) VALUES (1, 6, '2026-09-22 10:20:47.652866+00');
INSERT INTO private.role_permissions (role_id, permission_id, created_at) VALUES (1, 7, '2026-09-22 10:20:47.95085+00');
INSERT INTO private.role_permissions (role_id, permission_id, created_at) VALUES (2, 7, '2026-09-22 10:20:47.95085+00');
INSERT INTO private.role_permissions (role_id, permission_id, created_at) VALUES (1, 8, '2026-09-22 10:20:47.95085+00');
INSERT INTO public.import_models (id, name, provider, enabled, input_usd_per_million, output_usd_per_million, pricing_updated_at, updated_at, visible) VALUES ('google/gemini-3.1-flash-lite', 'Gemini 3.1 Flash Lite', 'Google', true, 0.25, 1.5, '2026-09-07 11:29:00+00', '2026-09-22 10:20:48.173332+00', true);
INSERT INTO public.import_models (id, name, provider, enabled, input_usd_per_million, output_usd_per_million, pricing_updated_at, updated_at, visible) VALUES ('google/gemini-2.5-flash-lite', 'Gemini 2.5 Flash Lite', 'Google', true, 0.1, 0.4, '2026-09-07 11:29:00+00', '2026-09-22 10:20:48.173332+00', true);
INSERT INTO public.import_models (id, name, provider, enabled, input_usd_per_million, output_usd_per_million, pricing_updated_at, updated_at, visible) VALUES ('qwen/qwen3-32b', 'Qwen3 32B', 'Qwen', true, 0.08, 0.28, '2026-09-07 11:29:00+00', '2026-09-22 10:20:48.173332+00', true);
INSERT INTO public.app_settings (key, value, updated_at, updated_by) VALUES ('imports.model', '"google/gemini-3.1-flash-lite"', '2026-09-22 10:20:48.173332+00', NULL);

-- The rows above carry their own ids, so the identity sequences are moved
-- past them; otherwise the next insert would collide with seeded data.
select setval('private.app_permissions_id_seq', (select max(id) from private.app_permissions));
select setval('private.app_roles_id_seq', (select max(id) from private.app_roles));

-- Every object is taken back to nothing before it is granted anything, so the
-- grants below are the whole of what each role holds rather than an addition
-- to whatever Supabase's defaults already handed out.

revoke all on function private.guard_import_model_catalogue() from public, anon, authenticated, service_role;

revoke all on function private.handle_new_user() from public, anon, authenticated, service_role;

revoke all on function private.has_permission(required_permission text) from public, anon, authenticated, service_role;

revoke all on function private.set_updated_at() from public, anon, authenticated, service_role;

revoke all on function private.sync_user_email() from public, anon, authenticated, service_role;

revoke all on function public.current_user_has_permission(required_permission text) from public, anon, authenticated, service_role;

revoke all on function public.set_role_permission(p_role_id bigint, p_permission_id bigint, p_enabled boolean) from public, anon, authenticated, service_role;

revoke all on function public.set_user_role(p_user_id uuid, p_role_key text) from public, anon, authenticated, service_role;

revoke all on table private.app_permissions from public, anon, authenticated, service_role;

revoke all on table private.app_roles from public, anon, authenticated, service_role;

revoke all on table private.role_permissions from public, anon, authenticated, service_role;

revoke all on table private.user_roles from public, anon, authenticated, service_role;

revoke all on table public.profiles from public, anon, authenticated, service_role;

revoke all on table public.app_settings from public, anon, authenticated, service_role;

revoke all on table public.import_models from public, anon, authenticated, service_role;

grant usage on schema private to authenticated;

grant usage on schema private to service_role;

grant usage on schema public to postgres;

grant usage on schema public to anon;

grant usage on schema public to authenticated;

grant usage on schema public to service_role;

revoke all on function private.guard_import_model_catalogue() from public;

revoke all on function private.handle_new_user() from public;

revoke all on function private.has_permission(required_permission text) from public;

grant all on function private.has_permission(required_permission text) to authenticated;

revoke all on function private.set_updated_at() from public;

revoke all on function private.sync_user_email() from public;

revoke all on function public.current_user_has_permission(required_permission text) from public;

grant all on function public.current_user_has_permission(required_permission text) to authenticated;

revoke all on function public.set_role_permission(p_role_id bigint, p_permission_id bigint, p_enabled boolean) from public;

grant all on function public.set_role_permission(p_role_id bigint, p_permission_id bigint, p_enabled boolean) to authenticated;

revoke all on function public.set_user_role(p_user_id uuid, p_role_key text) from public;

grant all on function public.set_user_role(p_user_id uuid, p_role_key text) to authenticated;

grant select on table private.app_permissions to authenticated;

grant select on table private.app_roles to authenticated;

grant select,delete on table private.role_permissions to authenticated;

grant insert(role_id) on table private.role_permissions to authenticated;

grant insert(permission_id) on table private.role_permissions to authenticated;

grant select,delete on table private.user_roles to authenticated;

grant insert(user_id) on table private.user_roles to authenticated;

grant insert(role_id) on table private.user_roles to authenticated;

grant insert(granted_by) on table private.user_roles to authenticated;

grant all on table public.profiles to service_role;

grant select on table public.profiles to authenticated;

grant update(display_name) on table public.profiles to authenticated;

grant update(student_number) on table public.profiles to authenticated;

grant all on table public.app_settings to service_role;

grant select,insert,delete,update on table public.app_settings to authenticated;

grant all on table public.import_models to service_role;

grant select,insert,update on table public.import_models to authenticated;

alter default privileges for ROLE postgres in schema public grant all on SEQUENCES to postgres;

alter default privileges for ROLE postgres in schema public grant all on SEQUENCES to service_role;

alter default privileges for ROLE postgres in schema public grant all on FUNCTIONS to postgres;

alter default privileges for ROLE postgres in schema public grant all on FUNCTIONS to anon;

alter default privileges for ROLE postgres in schema public grant all on FUNCTIONS to authenticated;

alter default privileges for ROLE postgres in schema public grant all on FUNCTIONS to service_role;

alter default privileges for ROLE postgres in schema public grant all on TABLES to postgres;

alter default privileges for ROLE postgres in schema public grant all on TABLES to service_role;

-- A profile is created from the account that Auth just made, and follows its
-- email afterwards. Both hang off auth.users, which is why they are written
-- out here rather than dumped with the rest of the account model.
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

create trigger on_auth_user_email_changed
after update of email on auth.users
for each row
when (old.email is distinct from new.email)
execute function private.sync_user_email();
