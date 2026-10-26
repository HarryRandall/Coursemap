import type { AssistantVisual } from "./attachments";

const GPA_THRESHOLD = /GPA of (?:at least )?(\d(?:\.\d+)?)/iu;
const MAX_REQUIREMENT_BARS = 8;

/**
 * The charts every plan reading gets, so they do not depend on the model
 * choosing to draw them: units placed against each requirement, and the
 * student's GPA against any GPA rule a planned course does not meet.
 */
export function planVisuals({
  gpa,
  requirements,
  terms,
}: {
  gpa: number | null;
  requirements: ReadonlyArray<{
    title: string;
    targetUnits: number | null;
    completedUnits: number;
    plannedUnits: number;
  }>;
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
  const measured = requirements
    .filter((requirement) => (requirement.targetUnits ?? 0) > 0)
    .slice(0, MAX_REQUIREMENT_BARS);
  if (measured.length)
    visuals.push({
      kind: "bars",
      title: "Units placed per requirement",
      unit: "units",
      items: measured.map((requirement) => ({
        label: requirement.title,
        value: requirement.completedUnits,
        ...(requirement.plannedUnits
          ? { planned: requirement.plannedUnits }
          : {}),
        target: requirement.targetUnits ?? undefined,
      })),
    });
  return visuals;
}
