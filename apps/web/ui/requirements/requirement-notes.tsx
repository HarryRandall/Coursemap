import { CircleAlert, Info } from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@coursemap/ui/components/alert";
import { Badge } from "@coursemap/ui/components/badge";
import type { RequirementNoteKind } from "@/lib/catalogue/note-kinds";
import { conditionTone } from "@/lib/coursemap/requirement-classification";
import { requirementNodeKey } from "@/lib/coursemap/requirement-progress";
import { CatalogueMarkdown } from "@/ui/common/catalogue-markdown";
import {
  conditionHeading,
  conditionInterpretation,
  formattedNoteText,
} from "@/ui/requirements/requirement-presentation";
import type {
  RequirementTreeCondition,
  RequirementTreeNode,
  TreeContext,
} from "@/ui/requirements/requirement-presentation";

/** Recommended notes read as ordinary advice, so they carry no label. */
const NOTE_KIND_BADGES: Partial<
  Record<
    RequirementNoteKind,
    { label: string; variant: "primary-light" | "warning-light" }
  >
> = {
  required: { label: "Required", variant: "primary-light" },
  check_with_anu: { label: "Check with ANU", variant: "warning-light" },
};

function noteText(condition: RequirementTreeCondition) {
  return (
    conditionInterpretation(condition) ||
    condition.freeText ||
    condition.sourceText
  ).trim();
}

/**
 * The rules a tree carries as prose: incompatibilities as warnings, and
 * notes as one quiet list rather than an alert apiece, since three boxes
 * each headed "Additional requirement" shouted over the courses.
 */
export function RequirementNotes({
  rules,
  context,
}: {
  rules: readonly RequirementTreeNode[];
  context: TreeContext;
}) {
  const conditions = rules.filter((rule) => rule.type === "condition");
  const warnings = conditions.filter(
    (condition) => conditionTone(condition) === "warning",
  );
  const notes = conditions.filter(
    (condition) =>
      conditionTone(condition) !== "warning" && noteText(condition) !== "",
  );
  const academicYear = context.catalogue.academicYear;
  const availableCourseCodes = new Set(
    context.catalogue.courses.map((course) => course.code),
  );
  return (
    <div className="flex flex-col">
      {warnings.length ? (
        <div className="flex flex-col gap-3 p-4 sm:p-5">
          {warnings.map((condition) => (
            <Alert key={requirementNodeKey(condition)} variant="warning">
              <CircleAlert aria-hidden="true" />
              <AlertTitle>{conditionHeading(condition)}</AlertTitle>
              <AlertDescription>
                {conditionInterpretation(condition)}
              </AlertDescription>
            </Alert>
          ))}
        </div>
      ) : null}
      {notes.length ? (
        <ul className="divide-y divide-border">
          {notes.map((condition) => {
            const formatted = formattedNoteText(condition);
            const badge = condition.noteKind
              ? NOTE_KIND_BADGES[condition.noteKind]
              : undefined;
            return (
              <li
                key={requirementNodeKey(condition)}
                className="flex items-start gap-3 px-4 py-3 text-sm sm:px-5"
              >
                <Info
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                />
                <div className="flex min-w-0 flex-col items-start gap-1.5">
                  {badge ? (
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  ) : null}
                  {formatted && academicYear ? (
                    <CatalogueMarkdown
                      markdown={formatted}
                      academicYear={academicYear}
                      availableCourseCodes={availableCourseCodes}
                    />
                  ) : (
                    <p className="text-foreground/80">{noteText(condition)}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
