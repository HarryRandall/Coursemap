# Catalogue read performance

Measure the public read path before changing a catalogue query. A successful
privileged database query does not establish that the anonymous API query is
fast: row-level security can repeat permission work for every joined row.

## Reproducing a slow read

1. Record the catalogue year, filters, result count, REST request count and
   wall-clock duration. Distinguish an uncached loader from a cached route.
2. Run normal, sequential public reads. Keep production diagnosis read-only,
   with an explicit read-only transaction guard for SQL. Do not load-test the
   hosted database or log credentials, request headers or private plans.
3. Compare the public role with the underlying published-only SQL projection.
   Use `EXPLAIN (ANALYZE, BUFFERS)` to separate execution from network time.
4. Compare result identities and counts, including archived and unpublished
   fixtures. A quicker empty result is not an optimisation.
5. Test scaled fixtures locally. Avoid timing assertions in ordinary tests;
   assert bounded reads, pagination, publication boundaries and cache reuse.

## Read boundaries

The directory first selects publication pointers for the requested year, then
reads bounded batches of those versions. The unfiltered directory retains all
years so it can choose the preferred edition of each course. Persistent cache
entries contain batches, rather than the complete multi-year index, to stay
below Next.js's 2 MB entry limit. Session batches have bounded concurrency.

Search and requirement suggestions share those publication batches. They count
and paginate the small index, then hydrate only the selected page. Candidate
search retains subject/title order and teaching-period names; the directory
retains course-code order and teaching-period codes.

Rich course-detail calls contain at most twelve codes, with two calls in flight.
A timed-out batch splits into smaller sequential reads; a single-course failure
still rejects the whole read. This preserves courses and their requested order
without repeating an oversized statement or hiding a missing course.

Filter menus use `published_course_filter_options()`. This aggregates only live
published course versions and returns labels across all years in one response.
Its public grants are intentional and covered by the anonymous RPC allow-list.
A cold statement timeout gets one retry; another timeout or a different error
reaches the caller. Failed reads do not become empty, cached filter choices.

`published_requirement_graph()` also projects only live published versions.
Its security-definer boundary avoids repeated editorial policies while keeping
all graph edges tied to those versions. Referenced, unavailable course codes
remain visible, but drafts and archived roots do not supply graph content.

## Investigation on 18 October 2026

These are individual diagnostic measurements, not service-level guarantees.
Application changes were measured through public read-only requests against the
production catalogue. New database functions were tested locally; their SQL
bodies were inspected read-only against production. These results do not mean
the migrations have been deployed.

| Read                                 | Baseline                                     | Changed path                                                      |
| ------------------------------------ | -------------------------------------------- | ----------------------------------------------------------------- |
| 2026 course directory                | 7,687 ms, 156 requests                       | 2,049 ms, 29 requests, same 3,012 matches                         |
| 2026 semester filter                 | 16,334 ms, 290 requests                      | 1,789 ms, 45 requests, same 1,363 matches                         |
| BCOMP requirement suggestions        | 3,179 ms, two candidate timeouts, 29 courses | 2,760 ms, no errors, 49 courses                                   |
| Global filter labels                 | 10,622 ms, 229 requests, 10 KB               | One aggregate response; underlying SQL measured 152 ms and 359 ms |
| Graph, 3,000 synthetic local courses | 131 ms                                       | 4.9 ms, same 13 edges                                             |

The production COMP2400 graph API returned SQLSTATE `57014` at approximately
three seconds. The public-role graph took 3,053 ms, compared with 167 ms under
the database owner. The local graph benchmark isolates the permission overhead;
it is not an observed production deployment result.

The first filter aggregate measurement took 4.4 seconds wall-clock. Subsequent
SQL execution was 359 ms with no JIT compilation, and a repeat read took 152 ms.
Retest cold deployment behaviour rather than treating the fastest sample as a
guarantee. Directory timing excludes the separate filter-menu loader.

## Remaining candidates

- Onboarding choices took 3,920 ms, 59 requests and about 519 KB. A compact
  published structure-options projection could reduce that fan-out, provided
  programme relationships and selectable structures retain their full semantics.
- A batch requesting 25 COMP course details returned 16 editions in 1,527 ms
  and about 239 KB. Keep the existing bounded detail batches; do not increase
  their size based on directory-summary timings.
- Optional requirement candidates still use the established partial-failure
  behaviour. Monitor errors as well as latency so missing suggestions do not
  look like a successful performance improvement.
