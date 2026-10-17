-- Who pays for a student's courses decides which published price applies:
-- a Commonwealth supported place pays its band's contribution, and
-- fee-paying students pay the domestic or international fee. Null means the
-- student has not said.
alter table public.profiles
  add column fee_status text,
  add constraint profiles_fee_status_check
    check (fee_status is null or fee_status in ('commonwealth_supported', 'domestic_fee', 'international'));

-- Owners already update their own row through profiles_owner_update; this
-- column grant matches the other student-editable profile details.
grant update (fee_status) on table public.profiles to authenticated;
