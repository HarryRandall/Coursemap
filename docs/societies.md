# Society directory and events

Club profiles and events are stored in `public.societies` and
`public.society_events`. The directory, profile pages, event details, Key dates
and Calendar read the same published records. Every event has a required club
foreign key. Archiving a club also hides its events from public reads.

## Initial snapshot

`apps/web/scripts/societies/data/anu-2026-09-28.json` contains 20 public events
and 23 club profiles checked against the ANUSA directory's Rubric listings on
28 September 2026. It includes every event organiser and the existing example
clubs. The former Music Society placeholder now uses the verified ANU School
of Music Collective profile. Existing club slugs and the three original event
UUIDs are retained. The other event identifiers are local UUIDs; numerical
Rubric identifiers remain source metadata.

Source URLs, retrieval time and content hashes are retained. Event times are
interpreted in `Australia/Sydney`, including daylight saving. Public descriptions
are short text extracts; missing descriptions use a short club summary. Images
remain hosted by Rubric. No member details, ticket buyers or private contact
information are imported.

## Import locally

Apply pending migrations without resetting an existing preview database:

```bash
pnpm exec supabase migration up --local
pnpm db:types
pnpm societies:import
```

The import command accepts an optional snapshot path. It refuses non-loopback
databases. Clubs and events are upserted in one transaction by source identifier.
Replays keep UUIDs stable and do not update unchanged records. Missing records
are never deleted or automatically archived. Published data is readable by
anonymous and authenticated roles; browser clients cannot write these tables.

This is a reviewed snapshot, not an automatic feed. A later ingestion job should
fetch only public club and event fields, validate all organiser relationships,
review source changes and import a new snapshot. Do not infer cancellation from
an event disappearing from a paginated response.

## Import into production after release

The application deployment does not import this snapshot. The production
database starts with empty society tables until you explicitly import it.
There is no society editor in the admin interface yet.

1. Merge and release the branch. Confirm the **Apply production migrations** CI
   job succeeded for that release, including `021_societies.sql`, and that the
   application deployment succeeded. These are separate release steps.
2. Generate a preview from the reviewed snapshot:

   ```bash
   pnpm societies:export --output /tmp/coursemap-societies-preview.sql
   ```

3. Open the **production project's** Supabase SQL Editor. Review the generated
   file, then run its complete contents as one query. The preview performs the
   import and verification inside a transaction, then rolls it back. It checks
   constraints without keeping any data. If it fails, resolve the error before
   continuing; do not run fragments of the file.
4. Generate the file that commits the import:

   ```bash
   pnpm societies:export --apply --output /tmp/coursemap-societies-apply.sql
   ```

   Review it and run its complete contents in the same production SQL Editor.
   The initial snapshot adds **23 clubs and 20 events**. The export command
   itself never connects to a database and needs no credentials. It refuses to
   overwrite an existing output file, so use a fresh filename on later runs.

5. Confirm the durable records with this separate read-only query:

   ```sql
   select 'societies' as kind, count(*) as stored,
     count(*) filter (where status = 'published') as published
   from public.societies where source = 'rubric'
   union all
   select 'events', count(*), count(*) filter (
     where status = 'published' and exists (
       select 1 from public.societies
       where societies.id = society_events.society_id
         and societies.status = 'published'
     )
   )
   from public.society_events where source = 'rubric';
   ```

   On an empty production database, both stored and published counts should be
   23 clubs and 20 events. Open `/societies`, a club profile and an event detail
   page. Check the **Society events** filter in Key dates and Calendar while
   signed in. Past events remain available in the club's Events tab and their
   detail pages; the directory's Upcoming events tab excludes finished events.

The SQL uses the same validated fields and source identifiers as the local
importer. Replays leave unchanged rows alone, preserve existing UUIDs and archive
status, and never delete missing listings. It resolves event organisers by their
stored source identifiers, so existing club UUIDs do not need to match the
snapshot. An error rolls back the entire import. Published records appear on the
next page load without another application deployment.

For additional clubs or refreshed events, create a reviewed snapshot in the same
JSON format and pass `--snapshot /path/to/snapshot.json` to both export commands.
Each club needs a unique slug, UUID, Rubric source identifier and provenance;
each event needs a UUID, source identifier, organiser slug and explicit time-zone
offsets. Use a new 64-character SHA-256 `sourceHash` whenever a record's reviewed
content changes, because unchanged hashes deliberately skip updates. Include
every organiser referenced by the snapshot's events. Membership and ticketing
stay with the original public listing.

## Calendar sources

Society events are off by default in both places:

- Key dates has a **Society events** option in its filter menu, persisted in the shareable URL as
  `societies=1`. Switching it off removes the source and any society-only filter.
  Events are grouped by their start date in Canberra and open their detail page.
- Calendar has **Category** and **Society events** filters, saved in
  the URL. Society events are off on each fresh visit. Turning them on shows events with their real start
  and end times; clicking one opens the same event detail page.

Society events remain independent of imported academic calendar data and never
change a student's plan or academic deadlines. Neither this command nor local
verification publishes the data to a hosted environment.
