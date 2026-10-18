"use client";
import { useMemo, useState } from "react";
import type { RequirementStage } from "@/lib/coursemap/requirement-stages";
import { OpenRulesContext } from "@/ui/requirements/requirement-condition";
import type { TreeContext } from "@/ui/requirements/requirement-presentation";
import { RequirementStageCard } from "@/ui/requirements/requirement-stage-card";
import { StructureComposition } from "@/ui/requirements/structure-composition";

/**
 * A structure's requirements for a reader with no plan behind the view: the
 * rules regrouped into stages under a bar showing how the units divide. With
 * nothing to tick off, every course list starts open; a reader closes the
 * ones they have seen.
 */
export function RequirementStageList({
  stages,
  context,
}: {
  stages: readonly RequirementStage[];
  context: TreeContext;
}) {
  const [closedKeys, setClosedKeys] = useState<ReadonlySet<string>>(new Set());
  const openRules = useMemo(
    () => ({
      isOpen: (key: string) => !closedKeys.has(key),
      toggle: (key: string) =>
        setClosedKeys((previous) => {
          const next = new Set(previous);
          if (!next.delete(key)) next.add(key);
          return next;
        }),
    }),
    [closedKeys],
  );
  if (stages.length === 0) return null;
  return (
    <OpenRulesContext.Provider value={openRules}>
      <div className="flex flex-col gap-4">
        <StructureComposition
          stages={stages}
          unitTarget={context.unitTarget ?? null}
          className="px-1"
        />
        {stages.map((stage, index) => (
          <RequirementStageCard
            key={`${stage.kind}-${index}`}
            stage={stage}
            context={context}
          />
        ))}
      </div>
    </OpenRulesContext.Provider>
  );
}
