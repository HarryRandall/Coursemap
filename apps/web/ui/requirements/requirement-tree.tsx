"use client";
import type { PlanRequirementGroup } from "@/lib/coursemap/plan-catalogue";
import { requirementNodeKey } from "@/lib/coursemap/requirement-progress";
import { unitsDescription } from "@/ui/requirements/requirement-presentation";
import type { TreeContext } from "@/ui/requirements/requirement-presentation";
import { RequirementCondition } from "@/ui/requirements/requirement-condition";

export function RequirementGroupView({
  group,
  context,
}: {
  group: PlanRequirementGroup;
  context: TreeContext;
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
      ),
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
      {children.map((child, index) => (
        <div key={requirementNodeKey(child)}>
          {alternative && index > 0 && group.operator === "any_of" ? (
            <p className="mb-4 text-center text-xs font-medium text-muted-foreground">
              or
            </p>
          ) : null}
          {child.type === "condition" ? (
            <RequirementCondition condition={child} context={context} />
          ) : (
            <RequirementGroupView group={child} context={context} />
          )}
        </div>
      ))}
    </div>
  );
}
