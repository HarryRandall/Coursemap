import { hidesCondition } from "@/lib/coursemap/requirement-classification";
import {
  pathwayInstruction,
  ruleMinimumUnits,
} from "@/lib/coursemap/requirement-stages";
import { requirementNodeKey } from "@/lib/coursemap/requirement-progress";
import { cn } from "@/lib/cn";
import { RequirementCondition } from "@/ui/requirements/requirement-condition";
import { formatUnits } from "@/ui/requirements/requirement-presentation";
import type {
  RequirementTreeGroup,
  TreeContext,
} from "@/ui/requirements/requirement-presentation";
import { RequirementGroupView } from "@/ui/requirements/requirement-tree";

const COLUMN_CLASS: Record<number, string> = {
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
};

/**
 * A choice between pathways drawn side by side, each under its own number,
 * so three honours routes read as three parallel options rather than a stack
 * of panels split by "or". Four or more fall into two columns. A short line
 * above says how many to choose, since "Option 1" alone does not.
 */
export function RequirementPathways({
  group,
  context,
  omitHeading = false,
  omitInstruction = false,
}: {
  group: RequirementTreeGroup;
  context: TreeContext;
  /** The surrounding heading already shows ANU's title, or its description when untitled. */
  omitHeading?: boolean;
  /** The surrounding heading already says how many to choose. */
  omitInstruction?: boolean;
}) {
  const options = group.children.filter(
    (child) => !(child.type === "condition" && hidesCondition(child, context)),
  );
  const courses = context.catalogue.courses.filter(
    (course) => course.year === context.catalogue.academicYear,
  );
  if (options.length === 0) return null;
  const title = omitHeading ? null : group.title;
  const description = omitHeading && !group.title ? null : group.description;
  const instruction = omitInstruction ? null : pathwayInstruction(group);
  return (
    <div>
      {title || description || instruction ? (
        <div className="border-b border-border px-4 py-2 sm:px-5">
          {title ? <p className="text-sm font-semibold">{title}</p> : null}
          {description ? (
            <p className="text-xs text-muted-foreground">{description}</p>
          ) : null}
          {instruction ? (
            <p className="text-xs font-medium text-muted-foreground">
              {instruction}
            </p>
          ) : null}
        </div>
      ) : null}
      <ol
        className={cn(
          "grid gap-px bg-border",
          COLUMN_CLASS[options.length] ??
            (options.length > 3 ? "md:grid-cols-2" : ""),
        )}
      >
        {options.map((option, index) => {
          const units = ruleMinimumUnits(option, courses);
          // A nested choice heads itself; a set of rules is drawn row by row
          // here, so its name and description sit under the option number.
          const caption =
            option.type === "group" && option.operator === "all_of"
              ? [option.title, option.description].filter(Boolean)
              : [];
          return (
            <li
              key={requirementNodeKey(option)}
              className="flex min-w-0 flex-col bg-card"
            >
              <div className="flex items-baseline justify-between gap-3 px-4 pt-3 pb-1 sm:px-5">
                <span className="text-xs font-semibold tracking-wide text-primary uppercase">
                  Option {index + 1}
                </span>
                {units !== null && units > 0 ? (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatUnits(units)}
                  </span>
                ) : null}
              </div>
              {caption.map((line) => (
                <p
                  key={line}
                  className="px-4 pb-1 text-xs text-muted-foreground sm:px-5"
                >
                  {line}
                </p>
              ))}
              {option.type === "condition" ? (
                <RequirementCondition condition={option} context={context} />
              ) : option.operator === "all_of" ? (
                <div className="divide-y divide-border">
                  {option.children.map((child) =>
                    child.type === "condition" ? (
                      <RequirementCondition
                        key={requirementNodeKey(child)}
                        condition={child}
                        context={context}
                      />
                    ) : (
                      <div
                        key={requirementNodeKey(child)}
                        className="px-4 py-3 sm:px-5"
                      >
                        <RequirementGroupView
                          group={child}
                          context={context}
                          nested
                        />
                      </div>
                    ),
                  )}
                </div>
              ) : (
                <div className="px-4 py-3 sm:px-5">
                  <RequirementGroupView
                    group={option}
                    context={context}
                    nested
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
