"use client";
import { RequirementGroupView } from "@/ui/requirements/requirement-tree";
import type { PlannedStructure } from "@/ui/plan/plan-suggestions";

/** The student's degree and chosen structures, sorted by what is left. */
export function PlanRequirements({
  structures,
}: {
  structures: PlannedStructure[];
}) {
  if (structures.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-3 text-xs text-muted-foreground">
        Requirements appear here once your degree&apos;s rules are published.
      </p>
    );
  }
  return (
    <div className="space-y-6">
      {structures.map((structure) => (
        <section
          key={structure.code}
          aria-label={structure.name}
          className="space-y-3"
        >
          <h2 className="text-sm font-semibold text-foreground">
            {structure.name}
          </h2>
          <RequirementGroupView
            group={structure.root}
            context={structure.context}
          />
        </section>
      ))}
    </div>
  );
}
