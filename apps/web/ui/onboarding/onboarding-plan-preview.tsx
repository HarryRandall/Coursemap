import { cn } from "@/lib/cn";

/** Years drawn before a degree is chosen, so the board has a shape from the start. */
const PLACEHOLDER_YEARS = 3;
const SEMESTERS = ["S1", "S2"] as const;
const SLOTS = 4;

/**
 * The plan the answers describe, drawn as the planner will show it: a row per
 * year with First and Second Semester, filling as each answer arrives.
 * Decorative; the answers themselves stay in the form beside it.
 */
export function OnboardingPlanPreview({
  className,
  name,
  degree,
  structures,
  startYear,
  years,
  coursesPerSemester,
}: {
  className?: string;
  name: string;
  degree: string;
  /** Major, minors and specialisations chosen so far. */
  structures: readonly string[];
  startYear: number | null;
  /** The degree's nominal length, once one is chosen. */
  years: number | null;
  /** Filled slots per semester, once a study load is chosen. */
  coursesPerSemester: number | null;
}) {
  const rows = years ?? PLACEHOLDER_YEARS;
  return (
    <div
      aria-hidden="true"
      className={cn(
        "w-full max-w-md overflow-hidden rounded-lg border border-border bg-card shadow-sm",
        className,
      )}
    >
      <div className="border-b border-border px-4 py-3.5">
        <p
          key={name.trim() ? "named" : "unnamed"}
          className="animate-fade-in truncate text-sm font-semibold text-foreground"
        >
          {name.trim() ? `${name.trim()}'s plan` : "Your plan"}
        </p>
        <p
          key={degree}
          className={cn(
            "mt-0.5 animate-fade-in truncate text-xs",
            degree ? "text-muted-foreground" : "text-muted-foreground/50",
          )}
        >
          {degree || "Degree not chosen"}
        </p>
        {structures.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {structures.map((structure) => (
              <span
                key={structure}
                className="max-w-full animate-count-pop truncate rounded-sm bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
              >
                {structure}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      {/* Re-keyed when the degree's length changes, so the years build in
          one after another. */}
      <div
        key={`${years}-${startYear}`}
        className="step-in-forward divide-y divide-border"
      >
        {Array.from({ length: rows }, (_, index) => (
          <div
            key={index}
            className={cn(
              "grid grid-cols-[4.5rem_1fr_1fr] items-center gap-3 px-4 py-3 transition-opacity duration-300",
              years === null && "opacity-50",
            )}
          >
            <span className="text-[11px] leading-tight text-muted-foreground">
              <span className="block font-medium text-foreground">
                Year {index + 1}
              </span>
              {startYear !== null ? startYear + index : "—"}
            </span>
            {SEMESTERS.map((semester) => (
              <div key={semester} className="space-y-1">
                <span className="block text-[10px] font-medium text-muted-foreground">
                  {semester}
                </span>
                <div className="grid grid-cols-4 gap-1">
                  {Array.from({ length: SLOTS }, (_, slot) => (
                    <span
                      key={slot}
                      className={cn(
                        "h-2.5 rounded-[2px] transition-colors duration-300 motion-reduce:transition-none",
                        coursesPerSemester !== null && slot < coursesPerSemester
                          ? "bg-primary/70"
                          : "bg-muted ring-1 ring-border ring-inset",
                      )}
                      style={{
                        transitionDelay: `${(index * 2 + slot) * 30}ms`,
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-border bg-muted/40 px-4 py-2.5 text-[11px] text-muted-foreground">
        <span>Summer · Autumn · Winter · Spring</span>
        <span>Optional</span>
      </div>
    </div>
  );
}
