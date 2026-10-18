import Link from "next/link";
import { isCatalogueKind } from "@/lib/catalogue/content";
import { publicCatalogueRecordPath } from "@/lib/coursemap/catalogue-kinds";
import {
  conditionHeading,
  conditionInterpretation,
} from "@/ui/requirements/requirement-presentation";
import type { RequirementTreeCondition } from "@/ui/requirements/requirement-presentation";

/** Academic structures a rule offers, for readers with no chooser of their own. */
export function StructureOptions({
  condition,
  academicYear,
  headed = true,
}: {
  condition: RequirementTreeCondition;
  academicYear: number | null;
  /** Off where the surrounding card already names what the options are. */
  headed?: boolean;
}) {
  const options = condition.options.filter(
    (option) => option.kind !== "course",
  );
  return (
    <section className="px-4 py-3 sm:px-5">
      {headed ? (
        <>
          <h3 className="text-sm font-medium">{conditionHeading(condition)}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {conditionInterpretation(condition)}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {conditionInterpretation(condition)}
        </p>
      )}
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const name = (
            <span className="min-w-0">
              <span className="font-mono text-sm font-semibold">
                {option.code}
              </span>
              {option.title ? (
                <span className="ml-2 text-muted-foreground">
                  {option.title}
                </span>
              ) : null}
            </span>
          );
          // Every catalogue page is addressed by year. Without one there is no
          // page to send the reader to, so the option reads as plain text.
          const href =
            academicYear !== null && isCatalogueKind(option.kind)
              ? publicCatalogueRecordPath(
                  option.kind,
                  academicYear,
                  option.code,
                )
              : null;
          return (
            <li key={`${option.kind}-${option.code}`}>
              {href ? (
                <Link
                  href={href}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:border-foreground/20 hover:bg-muted/40 motion-reduce:transition-none"
                >
                  {name}
                </Link>
              ) : (
                <span className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                  {name}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
