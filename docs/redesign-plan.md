# Coursemap redesign plan

Status: plan. Project A, the catalogue schema and import redesign, has landed;
its lasting decisions are in [architecture](architecture.md) and
[catalogue operations](catalogue-operations.md), and the work left on the
catalogue is in [catalogue automation](catalogue-automation.md). What remains
here is the prerequisite modelling and display work, the student interface
wiring and the campus map refresh.

When a pull request lands, move its lasting decisions into the relevant guide
and strike it from the sequence. Delete this document when the last project
lands.

Two decisions from Project A still bind the work below:

| Topic             | Decision                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| Requisite display | Every condition kind renders structurally on the student side. Prose is a fallback for `other`.   |
| Compass           | A real assistant over the student's plan and the published catalogue, with chats in the database. |

## Project B: prerequisite modelling and display

Depends on A4 for the shared requirement model and on A6 for the review gate.

### Target

- One `RequirementExpression` type in `lib/coursemap/requirement-types.ts`
  derived directly from `requirement_*` rows. It replaces both the narrow
  `RequisiteExpression` and `CourseRuleExpression`. Published read functions
  return the full tree. The text parser in `requisite-summary.ts` remains only
  as the administrator's automatic mapping aid.
- One evaluator in `lib/coursemap/requirement-evaluation.ts` used by the
  course page, the planner, plan risks and the requirements page. Inputs are
  completed attempts with marks, planned items with their period order,
  enrolled structures from the plan, GPA and WAM from academic history and
  year standing derived from completed units. Outcomes per node are `met`,
  `planned`, `not_met` or `unknown`, and `unknown` is limited to `permission`
  and `other`.
- The student-facing requisite card renders every kind structurally:
  - A group renders as a stack with a heading that states the rule in plain
    words: "Complete all of", "Complete any one of", "Complete at least 2 of",
    "Complete 24 units from". Nested groups indent one level with a connector.
  - Course conditions render as a stacked list of course chips with code,
    title, units and status colour, so "four courses" reads as four cards.
  - Unit conditions render as a progress bar with the count achieved and
    required and the scope ("in COMP", "at 2000 level or above").
  - `gpa`, `wam` and `year_standing` render as badges showing the student's
    value against the threshold when signed in.
  - `incompatible` renders as a separate red section, not inside the stack.
  - `structure` and `structure_set` render as programme chips linking to the
    published structure.
  - `permission` and `other` render as notes with the source text.
- The prerequisite graph draws group nodes for `any_of` and `at_least` so
  alternatives are visible, keeps course-code edges for `all_of`, and marks
  planned courses distinctly from completed ones.
- The administrator editor is reused for structure requirements. Automatic
  mapping is extended to the deterministic parser output. The editor no longer
  locks when a condition kind is unsupported because the vocabulary is shared.

### Stacked pull requests

| Order | Branch                                 | Scope                                                                                                              |
| ----- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| B1    | `refactor/requirements-01-expression`  | Single expression type and published read shape. Remove the narrow expression and the published text fallback.     |
| B2    | `feat/requirements-02-evaluation`      | Shared evaluator with planned, GPA, WAM, standing and incompatibility handling. Planner and plan risks consume it. |
| B3    | `feat/requirements-03-student-display` | Stacked requisite card, progress bars, badges, incompatibility section. Component tests for each kind.             |
| B4    | `feat/requirements-04-graph`           | Group-aware graph with planned state.                                                                              |
| B5    | `feat/requirements-05-admin-editor`    | Editor reuse for structures, extended automatic mapping, removal of the unsupported-kind lock.                     |

### Verification

Unit tests for the evaluator across every kind and operator, including
concurrent enrolment and marks. Component tests for each rendered kind and for
nested stacks. Playwright for one course with an `at_least` rule and one with a
`course_set_units` rule as a signed-in student with partial progress.

## Project C: student interface wiring

Depends on A3 for published reads and on B2 for the evaluator used by Compass
tools and plan-risk notifications.

### Target

- Shared states in `ui/common/`: `EmptyState` and `LoadingState` with a small
  set of variants, adopted by dashboard, plan, requirements, courses, calendar,
  Compass and rooms. Feature-specific empties keep their copy and illustration
  but use the shared frame.
- Notifications: a `notifications` table (`user_id`, `kind`, `title`, `body`,
  `href`, `read_at`, `created_at`, `dedupe_key`) with own-row RLS and a
  `mark_notifications_read` function. Producers: import run completion for
  administrators, key dates within seven days, new plan risks, published
  changes to a course in the student's plan. The bell reads real rows and the
  sample array is deleted.
- Compass: `assistant_chats`, `assistant_messages` and `assistant_usage`
  tables with own-row RLS. A streaming route at `app/api/assistant/chat` calls
  OpenRouter with the model from `app_settings[assistant.model]`, separate
  from the import model, with tools for course search, plan reading,
  requirement evaluation and requirement progress. Usage records tokens and
  cost per message and the usage page reads them. The `localStorage` draft
  store becomes an optimistic cache only. The "Coming soon" tools menu is
  removed.
- Landing: copy and screenshots reflect the shipped product, popular searches
  come from the published catalogue, and the primary call to action leads to
  onboarding.
- Onboarding and dashboard: the wizard reads structures through the shared
  published functions, the dashboard shows real requirement progress from the
  B2 evaluator, and the roadmap page reflects this plan.

### Stacked pull requests

| Order | Branch                             | Scope                                                      |
| ----- | ---------------------------------- | ---------------------------------------------------------- |
| C1    | `refactor/student-ui-01-states`    | Shared empty and loading states and adoption.              |
| C2    | `feat/student-ui-02-notifications` | Table, producers, bell inbox, mark-read.                   |
| C3    | `feat/student-ui-03-compass`       | Persistence, streaming route, tools, usage, model setting. |
| C4    | `feat/student-ui-04-landing`       | Landing refresh and data-driven searches.                  |
| C5    | `feat/student-ui-05-onboarding`    | Onboarding and dashboard polish, roadmap update.           |

### Verification

Database tests for own-row access on notifications and assistant tables.
Component tests for the shared states and the bell. Playwright for a student
who receives a notification after a plan risk appears and for one Compass
turn with a mocked model response.

## Project D: campus map interface

Independent of the other projects. Scheduled last.

- Split `room-finder.tsx` into a search panel, a layers panel, a directions
  panel and a floor stack, each with its own state, shown one at a time.
- Progressive disclosure: search first, layers and directions behind explicit
  controls, journey steps only during a route.
- Floor controls show the floor name, not the reference code.
- Admin tool rail groups the nine tools and moves keyboard hints to a help
  sheet.
- Remove the Preview badge once the above lands, and update the roadmap.

## Working agreement for the stack

- Branch from the previous branch in the sequence, not from `main`. Rebase
  forward when an earlier branch changes.
- Commit subjects follow `feat:`, `fix:` and `refactor:` as in
  [Contributing](../CONTRIBUTING.md).
- Nothing is pushed until the local stack is complete for the current project.
  Pushing happens in order, and each pull request targets the branch below it
  until that branch merges.
- Every branch passes `pnpm verify` and, for database changes, `pnpm db:reset`,
  `pnpm db:test`, `pnpm db:lint` and `pnpm db:types` before the next branch
  starts.
- Local work does not authorise storage bucket changes. Schema changes are
  added after the baseline in `supabase/migrations/` and reach the hosted
  project through the deployment pipeline, not by hand.
