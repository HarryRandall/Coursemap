-- Review a record's first reading from ANU.
--
-- A record's first sync fills its draft straight from the model's reading,
-- which used to leave nothing to review: the model's word was taken as read.
-- The sync now also records every filled part of that reading as a
-- `first_read` change, with the weakest confidence behind it, a band saying
-- how much it needs a person, and the reason. Publishing waits on every
-- `needs_review` change until an administrator approves or corrects it.

alter table public.catalogue_sync_changes
    drop constraint catalogue_sync_changes_classification_check;

alter table public.catalogue_sync_changes
    add constraint catalogue_sync_changes_classification_check check ((classification = any (array['source_change'::text, 'local_override'::text, 'conflict'::text, 'converged'::text, 'first_read'::text])));

alter table public.catalogue_sync_changes
    add column confidence numeric(5,4),
    add column review_band text,
    add column review_reason text;

alter table public.catalogue_sync_changes
    add constraint catalogue_sync_changes_confidence_check check (((confidence is null) or ((confidence >= (0)::numeric) and (confidence <= (1)::numeric))));

alter table public.catalogue_sync_changes
    add constraint catalogue_sync_changes_review_band_check check (((review_band is null) or (review_band = any (array['needs_review'::text, 'check'::text, 'accepted'::text]))));

-- Every first reading is rated; later syncs compare against a previous
-- reading instead and carry no band.
alter table public.catalogue_sync_changes
    add constraint catalogue_sync_changes_first_read_band_check check (((classification = 'first_read'::text) = (review_band is not null)));

-- Publishing checks for open first readings that still need a person.
create index catalogue_sync_changes_open_review_idx
    on public.catalogue_sync_changes using btree (record_id)
    where ((superseded_at is null) and (decision is null) and (review_band = 'needs_review'::text));

comment on column public.catalogue_sync_changes.confidence is 'The weakest model confidence behind a first reading, or null when none was given.';
comment on column public.catalogue_sync_changes.review_band is 'How much a first reading needs a person: needs_review blocks publishing, check is worth a look, accepted was stated plainly.';
comment on column public.catalogue_sync_changes.review_reason is 'Why a first reading landed in its band.';
