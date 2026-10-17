# Agent catalogue imports

Import whole ANU catalogue years into the local database without OpenRouter.
Deterministic parsers handle what they can verify; a local agent answers the
remaining interpretation requests, a second agent checks every answer, and only
approved answers reach the import pipeline. This sits beside the admin bulk
import and uses the same syncs, source versions, drafts and publication.

Everything here writes to the local database only. Loading the result into
production is a separate, owner-approved step.

## Workflow

1. Import a year. Records the parser fully verifies publish automatically; any
   record needing interpretation saves a request and its sync fails with
   `AGENT_ANSWER_PENDING`.

   ```bash
   pnpm catalogue:import-year --year 2026 --kinds course
   ```

2. Group pending requests into batches. Identical wording across years becomes
   one item.

   ```bash
   pnpm catalogue:agent-batches prepare
   ```

3. For each batch, one agent writes `<batch>.answers.json` following
   [Answering a batch](#answering-a-batch), then a different agent writes
   `<batch>.verdicts.json` following [Checking a batch](#checking-a-batch).

4. Save approved answers. Each answer is validated with the import adapter;
   rejected and invalid items stay pending for the next `prepare`.

   ```bash
   pnpm catalogue:agent-batches apply --all
   ```

5. Run the import again with `--skip-directory`. Only records still without a
   source version are retried, now reading the saved answers.

6. Publish the resulting drafts. Drafts with extraction errors, edits or an
   existing publication stay held for review in the admin workspace.

   ```bash
   pnpm catalogue:agent-publish --year 2026 --kinds course
   ```

7. After two answer and check rounds, publish the courses still held only by
   requisite leftovers with `--fallback`. The modelled rule is kept, and each
   leftover clause (unmodelled text, a clause withheld for unscoped AND/OR, and
   eligibility sentences the rule does not represent) is added verbatim as a
   "Check with ANU" note that never blocks a plan. When a flag says the
   modelled rule itself may be wrong (ambiguous AND/OR or a value the page
   does not print), the rule is kept as soft. Each requisite error becomes a
   warning, "Published with ANU's wording as a note; review the requisite
   rule.", so administrators can find the course later. Drafts an
   administrator has edited, and drafts with any other error, are never
   touched.

   ```bash
   pnpm catalogue:agent-publish --year 2026 --kinds course --fallback
   ```

   Use `--dry-run` with `--fallback` first to list the courses it would
   change. The admin bulk import never uses the fallback.

Requests, batches and answers live in the git-ignored `.catalogue-import/`
folder at the repository root. Answers are keyed by a hash of the complete
request, so a parser or prompt change produces new requests rather than reusing
answers written for different input.

## Answering a batch

Follow the batch's `instructions` and `schema` exactly. The requisite text in
each request also carries eligibility sentences from Other Information,
Assumed Knowledge and the introduction. The importer holds a course with an
error until the answer represents each of those sentences as a permission or
note whose `sourceText` is that sentence, as soft rules whose clauses come
from the sentence and name every course code it prints, or as a rule that
reads the same; it then lowers the error to a warning. In addition:

- Text fields copy source wording exactly, or are null.
- Codes for courses, programmes and subjects must appear verbatim in the
  input. Never invent a code, and never use a major, minor or specialisation
  code (such as `-MAJ`, `-MIN`, `-SPEC` or `-HSPC`) with `enrolled_in`.
- Use explicit parentheses and AND/OR wording for scope. When scope is
  genuinely ambiguous, put the clause in `unmodelledText` and leave the rule
  null rather than guessing.
- A modelled rule must never be stricter than the source. When an alternative
  route (an OR branch, a programme-specific exception, a credit that also
  counts) cannot be checked, model it as a soft condition inside the same
  `one_of` rather than dropping it. Leave the whole rule null only when the
  AND/OR scope of a hard clause is genuinely ambiguous.
- Every clause is a hard or soft requirement. A soft requirement is shown to
  students ("Recommended" or "You'll also need") but never blocks enrolment or
  a plan. Wrap any rule in `{ "op": "soft", "rule": …, "sourceText": "<exact
clause>" }` when the source only advises it ("should have completed",
  "recommended") or when Coursemap cannot check it. A soft wrapper's
  `sourceText` is the exact clause it covers.
- Assumed knowledge is always soft. It stays in `assumedKnowledgeText`, and
  the `prerequisiteRule` also carries it: each course code it names as a soft
  rule (`soft` around `completed MEDI8011`, with the exact clause), and each
  prose sentence as a note with `"recommended": true`, shown as
  "Recommended". It is hard only when ANU explicitly says it is mandatory or
  required.
- A condition no rule can check, such as an audition, an application form, a
  placement, a quota, an interview, an immersive experience or a
  native-speaker or cohort exclusion, is
  `{ "op": "note", "sourceText": "<exact sentence>" }`. A note's
  `sourceText` is one exact, full sentence: one note per sentence, never two
  sentences combined. A note is never checked and never blocks.
- A mandatory condition Coursemap cannot check, such as a police check,
  professional registration, immunisation or Working With Vulnerable People
  registration, is a note with `"required": true`. Students see it as
  "Required"; it still never blocks a plan.
- A route for students outside a programme ("students in other programs must
  have completed 24 units") is `all_of` of `enrolled_in` with
  `"matches": false` and the units rule, inside a `one_of` beside the route
  for students in the programme.
- Units of a programme's courses ("144 units of Bachelor of Philosophy (Arts)
  (APHAR or APNAR) courses") are soft `min_units_in_field` with the printed
  scope as `field`.
- Permission, consent or a permission code to enrol stays a hard
  `permission` with the exact wording, wherever it appears on the page
  (Other Information and the introduction included). Hard external or
  secondary-school requirements use `external_requirement`.
- An average over some courses is `minimum_gpa` with the printed
  `subjectCodes` or `courseCodes`. When the scope names no codes ("a Credit
  average in Science courses"), set `scopeText` to the printed scope and wrap
  it in soft. Never turn it into a whole-career GPA.
- Enrolment in a programme family named without codes ("a science degree",
  "a Master of Engineering") is soft `enrolled_in_programme_family` with the
  exact `family`. A printed list of programme codes is a `one_of` of
  `enrolled_in`.
- Units in a field the source does not name by subject code ("12 units in the
  relevant field/discipline") are soft `min_units_in_field`, inside the same
  `one_of` as their alternatives.
- The language rule "not permitted to enrol in a language course below one
  that they have already successfully completed" is soft
  `no_higher_course_in_subject` with the course's subject code.
- `unmodelledText` is only for garbled wording or a hard clause whose AND/OR
  scope is genuinely ambiguous. Clauses represented by a soft condition, a
  note or a permission must not also appear there.
- Empty source means no rules.
- A listed course counts once. When the source states that a course may be
  repeated (repeated topics, "may be taken twice", a research course taken in
  four semesters), add it to the course list's `repeatableCourses` with
  `maximumUnits` set to the total its attempts may contribute. Hold the part
  when the source gives no total or number of attempts.
- Never put a free-text condition inside a unit pool or give it units that
  courses would have to fill. No course can satisfy free text, so the total
  becomes unreachable.
- An `any_of` group credits a student through one branch only. A pool that
  may mix courses from several lists is an `all_of` of capped lists, not an
  `any_of`.
- Trailing tables after the main lists can be an alternative route. Hold them
  rather than dropping them when the page does not say they are superseded.
- On ANU structure pages, "The N units must include:" followed by capped lists
  that together cover the total is the standard exhaustive format, so every
  unit comes from those lists.

## Checking a batch

Approve an answer only when students could rely on it. Reject it with a
one-sentence reason when it:

- uses a code that is not printed in the source, or a structure code as a
  programme;
- changes AND/OR scope, completed versus concurrent, marks, units, levels or
  subjects;
- drops an eligibility clause instead of modelling it or keeping it in
  `unmodelledText`;
- turns advisory wording into a hard rule, or makes a checkable compulsory
  clause soft;
- makes assumed knowledge hard when ANU does not say it is mandatory, or
  leaves out a course code it names instead of a soft rule;
- drops an uncheckable condition (an audition, application, quota or
  placement) instead of keeping it as a note, or leaves `required` off a
  mandatory one such as a police check;
- gives a note a `sourceText` that is not one exact full sentence, or a soft
  wrapper one that is not the exact clause it covers;
- models part of a requirement in a way that turns away students the source
  accepts, including a dropped exception whose main route is then compulsory
  for everyone;
- models a repeated-course route as a course list without a
  `repeatableCourses` allowance, or gives an allowance the source does not
  state;
- places free text inside a unit pool, making the total unreachable;
- uses `any_of` where students may mix branches; or
- drops trailing tables that may be an alternative route.

The checker writes `{ "<item id>": { "approve": true } }` or
`{ "<item id>": { "approve": false, "reason": "..." } }` for every item.
