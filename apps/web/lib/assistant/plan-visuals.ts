import type { AssistantVisual } from "./attachments";

const GPA_THRESHOLD = /GPA of (?:at least )?(\d(?:\.\d+)?)/iu;

/**
 * The chart a plan reading always gets, so it does not depend on the model
 * choosing to draw it: the student's GPA against any GPA rule a planned
 * course does not meet. Other charts are drawn when the question calls for
 * them.
 */
export function planVisuals({
  gpa,
  terms,
}: {
  gpa: number | null;
  terms: ReadonlyArray<{
    courses: ReadonlyArray<{ code: string; issues?: string[] }>;
  }>;
}): AssistantVisual[] {
  const visuals: AssistantVisual[] = [];
  const gpaRule = terms
    .flatMap((term) => term.courses)
    .flatMap((course) =>
      (course.issues ?? []).flatMap((issue) => {
        const match = GPA_THRESHOLD.exec(issue);
        return match
          ? [{ code: course.code, threshold: Number(match[1]) }]
          : [];
      }),
    )
    .find((rule) => rule.threshold <= 7);
  if (gpaRule && gpa !== null)
    visuals.push({
      kind: "meter",
      title: `Your GPA against the ${gpaRule.code} requirement`,
      value: gpa,
      max: 7,
      target: gpaRule.threshold,
      unit: "GPA",
    });
  return visuals;
}
