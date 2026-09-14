"use client";
import type {
  AdminStructureReviewCondition,
  AdminStructureReviewGroup,
} from "@/lib/coursemap/admin-catalogue";

export function conditionText(condition: AdminStructureReviewCondition) {
  if (condition.optionCodes.length > 1) {
    return `${condition.kind === "structure_list" ? "Choose a structure from" : "Choose courses from"}: ${condition.optionCodes.join(", ")}`;
  }
  if (condition.courseCode) {
    return (
      <>
        Complete{" "}
        <span className="font-mono font-semibold">{condition.courseCode}</span>
      </>
    );
  }
  if (condition.targetStructureCode && condition.targetStructureKind) {
    return (
      <>
        Complete{" "}
        <span className="font-mono font-semibold">
          {condition.targetStructureCode}
        </span>
      </>
    );
  }

  const level =
    condition.minimumLevel && condition.maximumLevel
      ? `${condition.minimumLevel} to ${condition.maximumLevel} level `
      : condition.minimumLevel
        ? `${condition.minimumLevel} level or above `
        : "";
  const units = condition.minimumUnits
    ? `${condition.minimumUnits} units `
    : "";
  const subject = condition.subjectCode ? `of ${condition.subjectCode} ` : "";
  const summary = `${units}${subject}${level}`.trim();
  return summary
    ? `Complete ${summary}`
    : (condition.sourceText ?? "Condition");
}
export function GroupCard({ group }: { group: AdminStructureReviewGroup }) {
  return (
    <section className="border-b border-border/60 px-5 py-4 last:border-b-0 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{group.name}</h3>
        <span className="font-mono text-xs text-muted-foreground">
          {group.code}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {group.operator === "all_of" ? "Complete all of" : "Complete any of"}
        {group.minimumUnits ? ` · at least ${group.minimumUnits} units` : ""}
        {group.minimumCount ? ` · at least ${group.minimumCount} items` : ""}
      </p>
      {group.description ? (
        <p className="mt-2 text-sm leading-6 text-foreground/80">
          {group.description}
        </p>
      ) : null}
      {group.conditions.length ? (
        <ul className="mt-3 space-y-1.5 border-l border-border pl-4 text-sm text-foreground/80">
          {group.conditions.map((condition) => (
            <li key={condition.id}>{conditionText(condition)}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          No conditions were imported for this group.
        </p>
      )}
    </section>
  );
}
