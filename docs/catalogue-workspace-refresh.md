# Catalogue review workspaces

Courses, programmes, majors, minors and specialisations use the same lifecycle:

1. Directory discovery creates a stable catalogue identity.
2. The first successful import becomes working content automatically.
3. An administrator reviews sections individually or clicks **Approve eligible sections**.
4. **Publish** becomes available once all required sections are approved and blocking review work is resolved.
5. Later edits remain unpublished until reviewed and published again.

## Addresses

The review workspace is `/admin/{collection}/{annual-record-uuid}`. History and
preview use `/history` and `/preview`. Historical versions use
`/versions/{version-uuid}` and are read-only, including when the selected version
is also current. Codes are display and search values. Numeric database IDs are
internal; neither codes nor numeric version IDs are detail addresses.

The UUID identifies one catalogue year, which is displayed on the page. There are no
year-segment detail routes, code-addressed detail routes, standalone
import detail pages or compatibility redirects. The `view` and `snapshot` query
parameters are rejected. `section` selects a section within Review and `import`
selects a processing entry within History. Directory pagination and filters remain
query parameters.

## Approval

Approval is explicit. There is no approval on import completion. Prerequisites
and structure requirements always require manual approval. Bulk approval requires
verified source evidence and passed checks; model confidence alone is insufficient.
The initial policy is deliberately conservative: incomplete evidence coverage,
model-only evidence or an open non-manual import issue prevents bulk approval.

Approvals are stored in the database with the administrator, method, timestamp
and content fingerprint. Changing a section clears its approval; unchanged
sections retain their approval. Returning a changed section to older content does
not resurrect an earlier approval. Publication checks approvals in the database,
not just through a disabled button.

Sections autosave after editing settles. Validation failures keep the entered
content available for correction. Warnings can be acknowledged through manual
review; structural validation and blocking requirement issues still prevent
publication. The published version stays unchanged while editing.

## Re-imports and history

Re-import review compares incoming content with the working version and displays
only differences. Administrators select fields to apply. The database applies the
selection transactionally and refuses stale comparisons. Related fields must
still form a valid complete projection. Unselected content is preserved. An
unchanged import reports **No changes found**.

History contains imports, version links, section decisions and publications.
The selected import's processing details start expanded. Source files and
processing details stay in History. Restoring a historical version creates working
content; changed sections require review before publication.

## Local verification and rollout

The workspace migration adds public snapshot UUIDs, directory identity creation,
section approval records and permission-checked review, comparison, restore and
publication enforcement. Apply it with the application changes. Test against an
isolated local Supabase stack before applying to a hosted database. Local
implementation and tests do not authorise hosted migrations or publication.
