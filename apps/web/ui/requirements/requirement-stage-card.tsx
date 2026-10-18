"use client";
import { useId } from "react";
import { requirementNodeKey } from "@/lib/coursemap/requirement-progress";
import type { RequirementStage } from "@/lib/coursemap/requirement-stages";
import { cn } from "@/lib/cn";
import { RequirementCondition } from "@/ui/requirements/requirement-condition";
import { RequirementNotes } from "@/ui/requirements/requirement-notes";
import { RequirementPathways } from "@/ui/requirements/requirement-pathways";
import { formatUnits } from "@/ui/requirements/requirement-presentation";
import type {
  RequirementTreeNode,
  TreeContext,
} from "@/ui/requirements/requirement-presentation";
import { STAGE_FILL_CLASS } from "@/ui/requirements/requirement-stage-colours";
import { RequirementGroupView } from "@/ui/requirements/requirement-tree";
import { StructureOptions } from "@/ui/requirements/structure-options";

/** Rules as the rows of one card, a choice between pathways as columns. */
function StageRows({
  nodes,
  context,
}: {
  nodes: readonly RequirementTreeNode[];
  context: TreeContext;
}) {
  return (
    <div className="divide-y divide-border">
      {nodes.map((node) => {
        const key = requirementNodeKey(node);
        if (node.type === "condition") {
          return node.conditionKind === "structure_set" &&
            node.options.some((option) => option.kind !== "course") ? (
            <StructureOptions
              key={key}
              condition={node}
              academicYear={context.catalogue.academicYear}
              headed={false}
            />
          ) : (
            <RequirementCondition
              key={key}
              condition={node}
              context={context}
            />
          );
        }
        if (node.operator === "any_of" || node.operator === "at_least") {
          return (
            <RequirementPathways key={key} group={node} context={context} />
          );
        }
        return (
          <div key={key} className="px-4 py-3 sm:px-5">
            <RequirementGroupView group={node} context={context} nested />
          </div>
        );
      })}
    </div>
  );
}

/**
 * One stage of a structure's requirements: a heading with the share of the
 * degree it fills, then its rules. One level of card, whatever the tree
 * nested, so a page of stages reads as a list rather than boxes in boxes.
 */
export function RequirementStageCard({
  stage,
  context,
}: {
  stage: RequirementStage;
  context: TreeContext;
}) {
  const headingId = useId();
  const group =
    stage.rules.length === 1 && stage.rules[0].type === "group"
      ? stage.rules[0]
      : null;
  return (
    <section
      aria-labelledby={headingId}
      className="overflow-hidden rounded-xl border border-border bg-card"
    >
      <header className="flex items-baseline justify-between gap-4 border-b border-border px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            aria-hidden="true"
            className={cn(
              "mt-1.5 size-2 shrink-0 rounded-full",
              STAGE_FILL_CLASS[stage.kind],
            )}
          />
          <h2 id={headingId} className="text-sm font-semibold text-pretty">
            {stage.title}
          </h2>
        </div>
        {stage.units !== null && stage.units > 0 ? (
          <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
            {formatUnits(stage.units)}
          </span>
        ) : null}
      </header>
      {stage.kind === "notes" ? (
        <RequirementNotes rules={stage.rules} context={context} />
      ) : stage.kind === "pathways" && group ? (
        <RequirementPathways
          group={group}
          context={context}
          omitHeading
          omitInstruction={!group.title && !group.description}
        />
      ) : (stage.kind === "set" || stage.kind === "degree") && group ? (
        <>
          {group.title && group.description ? (
            <p className="border-b border-border px-4 py-2 text-xs text-muted-foreground sm:px-5">
              {group.description}
            </p>
          ) : null}
          <StageRows nodes={group.children} context={context} />
        </>
      ) : (
        <StageRows
          nodes={stage.rules}
          context={
            stage.kind === "limits"
              ? { ...context, limitsStage: true }
              : context
          }
        />
      )}
    </section>
  );
}
