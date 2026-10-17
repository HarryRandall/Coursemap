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

Requests, batches and answers live in the git-ignored `.catalogue-import/`
folder at the repository root. Answers are keyed by a hash of the complete
request, so a parser or prompt change produces new requests rather than reusing
answers written for different input.

## Answering a batch

Follow the batch's `instructions` and `schema` exactly. In addition:

- Text fields copy source wording exactly, or are null.
- Codes for courses, programmes and subjects must appear verbatim in the
  input. Never invent a code, and never use a major, minor or specialisation
  code (such as `-MAJ`, `-MIN`, `-SPEC` or `-HSPC`) with `enrolled_in`.
- Use explicit parentheses and AND/OR wording for scope. When scope is
  genuinely ambiguous, put the clause in `unmodelledText` and leave the rule
  null rather than guessing.
- A modelled rule must never be stricter than the source. When an alternative
  route (an OR branch, a programme-specific exception, a credit that also
  counts) cannot be modelled, leave the whole rule null and keep the sentence
  in `unmodelledText`. Leaving a clause unmodelled may only make the rule more
  lenient.
- Advisory wording such as "recommended" or assumed knowledge is not a rule.
- Hard external or secondary-school requirements use `external_requirement`
  with the exact source text; convener consent uses `permission`.
- Empty source means no rules.
- A route that repeats the same course (repeated topics, "may be taken twice")
  cannot be a course list, because each code counts once; hold that part.
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
- turns advisory wording into a hard rule;
- models part of a requirement in a way that turns away students the source
  accepts, including a dropped exception whose main route is then compulsory
  for everyone;
- models a repeated-course route as a course list;
- places free text inside a unit pool, making the total unreachable;
- uses `any_of` where students may mix branches; or
- drops trailing tables that may be an alternative route.

The checker writes `{ "<item id>": { "approve": true } }` or
`{ "<item id>": { "approve": false, "reason": "..." } }` for every item.
