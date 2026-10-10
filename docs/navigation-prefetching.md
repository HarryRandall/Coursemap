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

