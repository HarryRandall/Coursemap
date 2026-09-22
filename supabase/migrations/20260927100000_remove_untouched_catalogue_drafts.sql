-- Opening a catalogue record used to create its draft, so every record anyone
-- had ever looked at reported itself as a draft, and discarding one brought it
-- straight back on the next render. A draft is now created by the first change
-- worth keeping, which leaves the rows that bug produced behind.
--
-- Those rows are exactly the drafts still at revision 0 that were not restored
-- from a version. A draft at revision 0 has never been saved, so its content is
-- byte-identical to the publication or the empty record it was created from,
-- and restoring is the only other way to sit at revision 0. Deleting them
-- therefore loses no authored work; their provenance rows cascade away with
-- them, and the next edit recreates whatever it needs.
delete from public.catalogue_drafts
where revision = 0 and restored_from_version_id is null;
