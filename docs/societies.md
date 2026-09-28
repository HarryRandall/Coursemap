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
