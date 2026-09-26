"use client";
import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { requirementNodeKey } from "@/lib/coursemap/requirement-progress";
import {
  flattenRules,
  hidesCondition,
  isNotice,
  requirementRowStatus,
  unitsDescription,
} from "@/ui/requirements/requirement-presentation";
import type {
  RequirementTreeGroup,
  RequirementTreeNode,
  TreeContext,
} from "@/ui/requirements/requirement-presentation";
import { RequirementCondition } from "@/ui/requirements/requirement-condition";

/** Rules sorted by what the student still has to do, in the order shown. */
const sections = [
  { label: "Still to do", kinds: ["todo", "unmeasured"], folded: false },
  { label: "Limits", kinds: ["limit", "over_limit"], folded: false },
  { label: "Planned", kinds: ["planned"], folded: false },
  { label: "Complete", kinds: ["complete"], folded: false },
] as const;

/**
 * A choice whose other options this view leaves out, such as a major picked
 * through its own tab, has only one rule left to show. Heading it "Choose one
 * of these options" over a single rule reads as a mistake, so it is drawn as
 * that rule with a line naming what else would do.
 */
function loneAlternative(node: RequirementTreeNode, context: TreeContext) {
  if (node.type !== "group" || node.operator !== "any_of") return null;
  const hidden = node.children.filter(
    (child) => child.type === "condition" && hidesCondition(child, context),
  );
  const shown = node.children.filter((child) => !hidden.includes(child));
  const rule = shown[0];
  if (shown.length !== 1 || rule.type !== "condition" || !hidden.length) {
    return null;
  }
  const kinds = [
    ...new Set(
      hidden.flatMap((child) =>
        child.type === "condition"
          ? child.options
              .filter((option) => option.kind !== "course")
              .map((option) => option.structureKind ?? option.kind)
          : [],
      ),
    ),
  ];
  return {
    rule,
    note: kinds.length
      ? `Or complete a listed ${kinds.join(" or ")} instead`
      : "Or meet one of the other listed options instead",
  };
}

/** Rules drawn as rows of one bordered panel. */
function RequirementPanel({
  nodes,
  context,
  alternative,
  label,
  folded = false,
}: {
  nodes: RequirementTreeNode[];
  context: TreeContext;
  alternative: boolean;
  label?: string;
  /** Starts closed behind its label. */
  folded?: boolean;
}) {
  const [open, setOpen] = useState(!folded);
  const panelId = useId();
  if (nodes.length === 0) return null;
  const labelClass =
    "text-xs font-medium tracking-wide text-muted-foreground uppercase";
  return (
    <section aria-label={label}>
      {label && folded ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen(!open)}
          className={`${labelClass} mb-2 flex items-center gap-1.5 rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring`}
        >
          {label}
          <span className="font-normal tabular-nums">{nodes.length}</span>
          <ChevronDown
            aria-hidden="true"
            className={`size-3.5 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          />
        </button>
      ) : label ? (
        <p aria-hidden="true" className={`${labelClass} mb-2`}>
          {label}
        </p>
      ) : null}
      <div
        id={panelId}
        hidden={!open}
        className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card"
      >
        {nodes.map((child, index) => (
          <div key={requirementNodeKey(child)}>
            {alternative && index > 0 ? (
              <p className="border-b border-border bg-muted/30 py-1 text-center text-xs font-medium text-muted-foreground">
                or
              </p>
            ) : null}
            {child.type === "condition" ? (
              <RequirementCondition condition={child} context={context} />
            ) : loneAlternative(child, context) ? (
              <RequirementCondition
                condition={loneAlternative(child, context)!.rule}
                note={loneAlternative(child, context)!.note}
                context={context}
              />
            ) : (
              <div className="px-4 py-3 sm:px-5">
                <RequirementGroupView group={child} context={context} nested />
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export function RequirementGroupView({
  group,
  context,
  nested = false,
}: {
  group: RequirementTreeGroup;
  context: TreeContext;
  /** Inside another group's panel, where rules are not sorted into sections. */
  nested?: boolean;
}) {
  const alternative =
    group.operator === "any_of" || group.operator === "at_least";
  const children = group.children.filter(
    (child) =>
      !(
        child.type === "condition" &&
        child.conditionKind === "units_total" &&
        (child.minimumUnits === context.unitTarget ||
          child.maximumUnits === context.unitTarget) &&
        (child.minimumUnits === null ||
          child.minimumUnits === context.unitTarget) &&
        (child.maximumUnits === null ||
          child.maximumUnits === context.unitTarget)
      ) && !(child.type === "condition" && hidesCondition(child, context)),
  );
  const onlyChild = children.length === 1 ? children[0] : null;
  const inheritedTarget =
    group.minimumUnits === context.unitTarget &&
    (group.maximumUnits === null || group.maximumUnits === context.unitTarget);
  const repeatedBounds =
    onlyChild &&
    onlyChild.minimumUnits === group.minimumUnits &&
    onlyChild.maximumUnits === group.maximumUnits;
  const units =
    !inheritedTarget && !repeatedBounds
      ? unitsDescription(group.minimumUnits, group.maximumUnits)
      : null;
  if (children.length === 0) return null;
  const rows = children.filter((child) => !isNotice(child));
  const notices = children.filter(isNotice);
  // With a plan behind the view, the top level sorts rules by what is left
  // to do. Alternatives keep their order, since the choice is between them.
  const sorted = !nested && !alternative && context.showPlanProgress !== false;
  const sortedRules = sorted
    ? flattenRules(rows).filter(
        (child) =>
          !(child.type === "condition" && hidesCondition(child, context)),
      )
    : [];
  const shownNotices = sorted
    ? [...notices, ...sortedRules.filter(isNotice)]
    : notices;
  return (
    <div className="space-y-4">
      {alternative || units ? (
        <div>
          <h3 className="text-sm font-semibold">
            {group.operator === "any_of"
              ? "Choose one of these options"
              : group.operator === "at_least"
                ? `Choose at least ${group.minimumCount ?? 1} of these options`
                : "Course requirements"}
          </h3>
          {units ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {units} across the following requirements
            </p>
          ) : null}
        </div>
      ) : null}
      {group.description ? (
        <p className="text-sm text-muted-foreground">{group.description}</p>
      ) : null}
      {sorted ? (
        sections.map((section) => (
          <RequirementPanel
            key={section.label}
            label={section.label}
            folded={section.folded}
            nodes={sortedRules.filter(
              (child) =>
                !isNotice(child) &&
                (section.kinds as readonly string[]).includes(
                  requirementRowStatus(child, context).kind,
                ),
            )}
            context={context}
            alternative={false}
          />
        ))
      ) : (
        <RequirementPanel
          nodes={rows}
          context={context}
          alternative={group.operator === "any_of"}
        />
      )}
      {shownNotices.map((child) =>
        child.type === "condition" ? (
          <RequirementCondition
            key={requirementNodeKey(child)}
            condition={child}
            context={context}
          />
        ) : null,
      )}
    </div>
  );
}
