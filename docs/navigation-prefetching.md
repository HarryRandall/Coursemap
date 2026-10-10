# Navigation prefetching

The installed Next.js documentation under `apps/web/node_modules/next/dist/docs/`
is the reference for this checkout. In particular, see `staleTimes.md`,
`prefetching.md`, `use-router.md` and `revalidatePath.md` in that tree.

## Links and loading boundaries

| Links                                                                           | Choice                           | Reason                                                                                                                                    |
| ------------------------------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Student sidebar, home logo, account menu and admin navigation                   | Default prefetch                 | Dynamic destinations stop at their first `loading.tsx`, rather than fully loading a plan or a directory merely because a link is visible. |
| Help article navigation                                                         | Existing `prefetch={true}`       | Article content is local prose and does not read student plans.                                                                           |
| Course references, prerequisite diagrams, Markdown links and section navigation | Existing `prefetch={false}`      | Lists and graphs can expose many destinations, so viewport prefetching would create unused requests.                                      |
| Command search                                                                  | Existing navigation on selection | Search results do not need speculative page reads.                                                                                        |

Do not use `router.prefetch()` or `prefetch={true}` for private dynamic pages.
The installed docs assign fully prefetched pages to `staleTimes.static`, including
dynamic pages. Default prefetching and ordinary visits use the 30-second dynamic
interval; static content and loading boundaries use the 180-second interval.
Hover wrappers are unnecessary while the existing loading boundaries suffice.

Planner, Dashboard, course directory, course detail and Rooms already have
accessible skeletons. `withPlanningState` runs below those boundaries, so the
prefetch does not need to render private plan state to obtain the skeleton.
It starts the page and state loaders together when the page is requested.
Calendar also needs this state for study events. Compass reads its study context
in authenticated server tools, so its page shell does not need the plan provider.
Public structure readers suppress plan status and star controls; their pages
also use the lightweight shell.

## Preview comparison

1. Open production and the Vercel preview in separate browser profiles with the
   same student plan. Use a production build, since development does not run
   automatic Link prefetching. Repeat with an account-free guest plan.
2. In DevTools Network, preserve the log and filter RSC requests. Start at
   Dashboard, wait for viewport prefetches, then visit Rooms, Societies, Key dates,
   Help, Planner, course directory and a course detail. Compare request count,
   click-to-skeleton and click-to-content. Repeat each navigation within 30 seconds
   and after 30 seconds. Keep browser profiles and network throttling identical.
3. Add, move, remove and star a course; record a result; change a requirement
   placement, degree and extension years. Immediately revisit Dashboard,
   Requirements, Calendar and course detail, including Back/Forward. Confirm the
   saved change appears. Repeat guest edits, including same-year moves and results.
4. Sign out using the account menu, then use Back. Sign in to a different account
   in the same tab. Confirm the first account's plan, name and permissions never
   appear. Also test guest-to-account transfer, conflict choice and onboarding.
5. With Room Finder warmed in both profiles, publish an indoor map, then replace
   it with a draft. Open the public map again and confirm the publication changes.
   A manager can preview the draft; a guest and ordinary student cannot. Publish
   a key date and a degree change, then check Key dates and onboarding choices.
6. Repeat the skeleton and account-menu checks at a narrow viewport and with
   keyboard navigation. Record preview and production timings separately from
   local unit, build and CI results.

## Database reads

These are static counts of PostgREST queries and permission RPCs on a server
render, not measured latency. Auth token verification and client-side notification
polling are excluded. The populated-plan case includes planned and recorded
courses; empty plans skip several reads. `H` is the optional historical attempt
projection RPC, `P` is the unchanged public plan catalogue/enrichment reads, `O`
is the published onboarding catalogue reads, `K` is the published calendar reads,
`S` is the society directory reads, and `D` is existing course directory/detail
reads. Public course and structure caches already existed. A client router hit
avoids these route renders for the configured interval.

| Route or loader                                       | Before             | After, published caches warm |
| ----------------------------------------------------- | ------------------ | ---------------------------- |
| Root shell on Help, Roadmap, Printing or Compass      | 14                 | 2                            |
| Societies                                             | 14 + S             | 2 + S                        |
| Key dates                                             | 14 + K             | 2                            |
| Rooms, ordinary signed-in student, one place-id batch | 20                 | 3                            |
| Rooms, manager, one place-id batch                    | 20                 | 4                            |
| Rooms, guest, one place-id batch                      | 6                  | 0                            |
| Plan                                                  | 23 + H + P         | 17 + H + P                   |
| Dashboard                                             | 23 + H + P + O + K | 17 + H + P                   |
| Requirements                                          | 23 + H + P + O     | 17 + H + P                   |
| Academic history                                      | 23 + H + P         | 17 + H + P                   |
| Calendar                                              | 23 + H + P + K + S | 17 + H + P + S               |
| Profile                                               | 14 + O             | 14                           |
| Courses, including their existing loaders             | 14 + D             | 14 + D                       |
| Admin shell, before the requested admin page's reads  | 14                 | 3                            |
| Onboarding, signed-in student without a plan          | 4 + O              | 3                            |

The full state loader has up to 13 queries. The plan catalogue's private prefix
has 9, plus `H`. Six reads now overlap within a request: primary plan, rules year,
plan items, selected structures, attempts and attempt versions. Profile reads
also overlap between the root and page. Both loaders now start course-code and
academic-year lookups together rather than waiting for one before the other.
Dashboard already started its three independent loaders together. Plan's
requirement-course enrichment depends on the catalogue and stays sequential.
Existing relational chains retain their authorisation and historical-year
semantics; consolidating them into a new RPC is deferred because that would need
schema and database verification outside this task's delivery scope.

A cold map needs `4 + 2B` public queries for `B` place-id batches. Manager previews
add `B` private indoor-map queries. The ordinary signed-in cold Rooms case is
therefore 9 reads with one batch, and the manager case is 10. Managers and ordinary
students check `rooms.manage` once per request; guest checks issue no permission
RPC. New published caches use a 300-second revalidation interval and publication
uses `updateTag` for immediate expiry. External SQL/import changes need matching
cache invalidation or can wait for that interval.

## Mutation and identity audit

- Every successful action in `lib/coursemap/actions.ts` invalidates `/` as a
  layout, including stars. This covers all route-scoped plan providers. Failed
  writes do not invalidate. Academic result writes and guest-to-account transfer
  already invalidate that layout.
- Guest cookie writes share one commit function. It refreshes after a successful
  write, including results, stars, profile, placements and same-year moves. A
  cookie-capacity failure retains state and performs no refresh. Guest entry and
  exit, and onboarding navigation, retain their existing refresh or full-document
  transitions.
- Password sign-in and immediate sign-up use `window.location.assign`. OAuth and
  confirmation return through HTTP redirects. Sign-out is a native POST form to
  `/auth/logout`, followed by a no-store 303 redirect. These document navigations
  discard the previous in-memory router cache. The root's existing persisted
  `pageshow` reload also protects restored signed-in and guest documents.
- Admin catalogue actions invalidate their record paths, with publication tags
  on publish/unpublish. Role and user changes invalidate the root layout. Settings
  invalidate the admin layout. Key date actions invalidate their affected routes
  and published calendar tag; successful indoor saves invalidate Rooms and the
  published map tag, including a publication replaced by a draft. Revision
  conflicts do not invalidate the map.
- Notification writes reconcile their own client inbox; they do not alter plan
  state. Requisite search and assistant model actions are reads.

No user profiles, plans, attempts, permissions or manager drafts enter a shared
cache. React `cache` only deduplicates their reads within a server request.
Societies retains its existing request memoisation: its import is a standalone
local SQL workflow with no app publication hook. Adding a shared cache there
without an invalidation path would change import visibility. Composed plan
catalogues also remain request-only because their course and structure selections
come from the current plan.

## Cache Components migration

This checkout installs Next.js 16.3.8. Its migration guide says enabling
`cacheComponents` makes existing `dynamic`, `revalidate` and `fetchCache` route
exports incompatible. A separate migration would replace those exports, convert
public `unstable_cache` loaders to `use cache` with `cacheLife`/`cacheTag`, and put
runtime auth, cookies and uncached reads behind appropriate Suspense boundaries.
It would also need production-build, metadata, dynamic-param, identity and browser
navigation checks. This is broader than a safe navigation configuration change,
so Cache Components remains disabled here.
