-- What a student would like to be called, and their pronouns, shown on their
-- plan and to administrators who help them. Both are optional free text.
alter table public.profiles
  add column preferred_name text,
  add column pronouns text,
  add constraint profiles_preferred_name_length_check
    check (preferred_name is null or char_length(preferred_name) between 1 and 80),
  add constraint profiles_pronouns_length_check
    check (pronouns is null or char_length(pronouns) between 1 and 40);

-- Owners already update their own row through profiles_owner_update; these
-- column grants match the ones for display_name and student_number.
grant update (preferred_name) on table public.profiles to authenticated;
grant update (pronouns) on table public.profiles to authenticated;
