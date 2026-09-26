"use client";
import { requirementNodeKey } from "@/lib/coursemap/requirement-progress";
import {
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
  { label: "Still to do", kinds: ["todo", "unmeasured"] },
  { label: "Planned or complete", kinds: ["planned", "complete"] },
  { label: "Limits", kinds: ["limit", "over_limit"] },
] as const;

/** Rules drawn as rows of one bordered panel. */
function RequirementPanel({
  nodes,
  context,
  alternative,
  label,
}: {
  nodes: RequirementTreeNode[];
  context: TreeContext;
  alternative: boolean;
  label?: string;
}) {
  if (nodes.length === 0) return null;
  return (
    <section aria-label={label}>
      {label ? (
        <p
          aria-hidden="true"
          className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase"
        >
          {label}
        </p>
      ) : null}
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {nodes.map((child, index) => (
          <div key={requirementNodeKey(child)}>
            {alternative && index > 0 ? (
              <p className="border-b border-border bg-muted/30 py-1 text-center text-xs font-medium text-muted-foreground">
                or
              </p>
            ) : null}
            {child.type === "condition" ? (
              <RequirementCondition condition={child} context={context} />
            ) : (
              <div className="px-4 py-4 sm:px-5">
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
            nodes={rows.filter((child) =>
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
      {notices.map((child) =>
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
