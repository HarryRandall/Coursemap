-- Named course lists.
--
-- Degree rules can require units "from List X", where the list is published
-- outside the degree page, often by a college. A course list records that
-- membership for one academic year. Administrators draft it from a pasted
-- source or a fetched page, review it and publish it. Published membership is
-- read as a course tag named after the list, so a structure's tag condition
-- counts list members without changing any course version.

create table if not exists public.course_lists (
    id bigint generated always as identity,
    academic_year_id bigint not null,
    name text not null,
    source_url text,
    published_at timestamp with time zone,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    constraint course_lists_pkey primary key (id),
    constraint course_lists_academic_year_id_fkey foreign key (academic_year_id)
      references public.academic_years(id) on delete cascade,
    constraint course_lists_name_check check (btrim(name) <> '' and name = btrim(name)),
    constraint course_lists_source_url_check
      check (source_url is null or source_url ~ '^https://[^[:space:]]+$')
);

-- A list name is the tag that rules count, so it is one name per year
-- however it is capitalised.
create unique index if not exists course_lists_year_name_unique
    on public.course_lists using btree (academic_year_id, lower(name));

create table if not exists public.course_list_members (
    list_id bigint not null,
    state text not null,
    code text not null,
    constraint course_list_members_pkey primary key (list_id, state, code),
    constraint course_list_members_list_id_fkey foreign key (list_id)
      references public.course_lists(id) on delete cascade,
    constraint course_list_members_state_check check (state = any (array['draft'::text, 'published'::text])),
    constraint course_list_members_code_check check (code ~ '^[A-Z]{4}[0-9]{4}[A-Z]?$')
);

create index if not exists course_list_members_published_code_idx
    on public.course_list_members using btree (code)
    where state = 'published';

create or replace trigger course_lists_set_updated_at
    before update on public.course_lists
    for each row execute function private.set_updated_at();

alter table public.course_lists enable row level security;
alter table public.course_list_members enable row level security;

create policy course_lists_catalogue_writer_read on public.course_lists
    for select to authenticated
    using (( select private.has_permission('catalogue.write'::text) as has_permission));

create policy course_list_members_catalogue_writer_read on public.course_list_members
    for select to authenticated
    using (( select private.has_permission('catalogue.write'::text) as has_permission));

revoke all on table public.course_lists from public, anon, authenticated, service_role;
revoke all on table public.course_list_members from public, anon, authenticated, service_role;
revoke all on sequence public.course_lists_id_seq from public, anon, authenticated, service_role;
grant all on table public.course_lists to service_role;
grant all on table public.course_list_members to service_role;
grant all on sequence public.course_lists_id_seq to service_role;
grant select on table public.course_lists to authenticated;
grant select on table public.course_list_members to authenticated;

comment on table public.course_lists is 'Named course lists for one academic year, counted by degree rules as a course tag.';
comment on table public.course_list_members is 'Draft and published course codes of a course list.';

create or replace function private.require_catalogue_write() returns void
    language plpgsql stable
    set search_path to ''
    as $$
begin
  if not (select private.has_permission('catalogue.write')) then
    raise exception 'Catalogue editing permission is required.'
      using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.require_catalogue_write() from public, anon;
grant execute on function private.require_catalogue_write() to authenticated, service_role;

-- Creates a list when p_list_id is null, otherwise replaces its name, source
-- and draft membership. Published membership is untouched until publication.
create or replace function public.save_course_list(
    p_list_id bigint,
    p_academic_year integer,
    p_name text,
    p_source_url text,
    p_codes text[]
) returns bigint
    language plpgsql security definer
    set search_path to ''
    as $$
declare
  v_year_id bigint;
  v_list_id bigint := p_list_id;
begin
  perform private.require_catalogue_write();

  select id into v_year_id from public.academic_years where year = p_academic_year;
  if v_year_id is null then
    raise exception 'The academic year % is not registered.', p_academic_year
      using errcode = 'P0002';
  end if;

  if v_list_id is null then
    insert into public.course_lists (academic_year_id, name, source_url)
    values (v_year_id, btrim(p_name), nullif(btrim(coalesce(p_source_url, '')), ''))
    returning id into v_list_id;
  else
    update public.course_lists
    set name = btrim(p_name),
        source_url = nullif(btrim(coalesce(p_source_url, '')), '')
    where id = v_list_id and academic_year_id = v_year_id;
    if not found then
      raise exception 'That course list no longer exists.' using errcode = 'P0002';
    end if;
  end if;

  delete from public.course_list_members where list_id = v_list_id and state = 'draft';
  insert into public.course_list_members (list_id, state, code)
  select distinct v_list_id, 'draft', upper(btrim(code))
  from unnest(coalesce(p_codes, '{}'::text[])) as code
  where btrim(code) <> '';

  return v_list_id;
end;
$$;

create or replace function public.publish_course_list(p_list_id bigint) returns void
    language plpgsql security definer
    set search_path to ''
    as $$
begin
  perform private.require_catalogue_write();

  update public.course_lists set published_at = now() where id = p_list_id;
  if not found then
    raise exception 'That course list no longer exists.' using errcode = 'P0002';
  end if;

  delete from public.course_list_members where list_id = p_list_id and state = 'published';
  insert into public.course_list_members (list_id, state, code)
  select list_id, 'published', code
  from public.course_list_members
  where list_id = p_list_id and state = 'draft';
end;
$$;

create or replace function public.delete_course_list(p_list_id bigint) returns void
    language plpgsql security definer
    set search_path to ''
    as $$
begin
  perform private.require_catalogue_write();
  delete from public.course_lists where id = p_list_id;
  if not found then
    raise exception 'That course list no longer exists.' using errcode = 'P0002';
  end if;
end;
$$;

-- The published list names that tag each requested course in each year.
create or replace function public.published_course_list_tags(
    p_years integer[],
    p_codes text[]
) returns table (academic_year integer, course_code text, tag text)
    language sql stable security definer
    set search_path to ''
    as $$
  select years.year::integer, members.code, lists.name
  from public.course_list_members as members
  join public.course_lists as lists on lists.id = members.list_id
  join public.academic_years as years on years.id = lists.academic_year_id
  where members.state = 'published'
    and lists.published_at is not null
    and years.year = any (p_years)
    and members.code = any (p_codes)
  order by years.year, members.code, lower(lists.name);
$$;

comment on function public.save_course_list(bigint, integer, text, text, text[]) is 'Creates or updates a course list draft.';
comment on function public.publish_course_list(bigint) is 'Publishes a course list draft as the membership degree rules count.';
comment on function public.delete_course_list(bigint) is 'Deletes a course list and its membership.';
comment on function public.published_course_list_tags(integer[], text[]) is 'Published course list names for the requested courses and years.';

revoke all on function public.save_course_list(bigint, integer, text, text, text[]) from public, anon;
revoke all on function public.publish_course_list(bigint) from public, anon;
revoke all on function public.delete_course_list(bigint) from public, anon;
revoke all on function public.published_course_list_tags(integer[], text[]) from public;

grant execute on function public.save_course_list(bigint, integer, text, text, text[])
  to authenticated, service_role;
grant execute on function public.publish_course_list(bigint) to authenticated, service_role;
grant execute on function public.delete_course_list(bigint) to authenticated, service_role;
grant execute on function public.published_course_list_tags(integer[], text[])
  to anon, authenticated, service_role;
