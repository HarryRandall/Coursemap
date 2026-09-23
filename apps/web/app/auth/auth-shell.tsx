import Link from "next/link";
import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { BrandMark } from "@/ui/brand-mark";

const highlights = [
  "Search every published ANU course in seconds",
  "Follow prerequisite chains before you enrol",
  "Keep one degree plan across every semester",
] as const;

/**
 * Two-column authentication layout: the form on the left, a colourful
 * product panel on the right. The panel is decorative and hidden on small
 * screens, so all meaningful content lives in the form column.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh bg-background lg:grid-cols-[1fr_minmax(0,44rem)]">
      <section className="flex flex-col px-5 py-6 sm:px-10">
        <Link
          href="/"
          aria-label="Coursemap home"
          className="inline-flex w-fit items-center gap-2.5 text-foreground"
        >
          <BrandMark className="size-9" />
          <strong className="brand-wordmark text-lg">coursemap</strong>
        </Link>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Coursemap is an independent planning tool. It is not an official ANU
          system and does not replace Programs and Courses or academic advice.
        </p>
      </section>

      <aside
        aria-hidden="true"
        className="landing-mesh relative hidden overflow-hidden border-l border-border lg:block"
      >
        <div className="absolute inset-0 flex flex-col justify-center gap-8 px-14">
          <div className="max-w-md">
            <p className="text-xs font-bold tracking-wider text-primary uppercase">
              Your ANU degree, mapped
            </p>
            <h2 className="mt-3 text-3xl leading-tight font-bold tracking-tight text-foreground">
              Every course, every prerequisite, one clear plan.
            </h2>
            <ul className="mt-6 space-y-3">
              {highlights.map((highlight) => (
                <li
                  key={highlight}
                  className="flex items-center gap-3 text-sm text-foreground/80"
                >
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-card text-primary shadow-xs ring-1 ring-border">
                    <Check className="size-3.5" />
                  </span>
                  {highlight}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative max-w-md">
            <div className="rounded-3xl bg-card/90 p-5 shadow-lg ring-1 ring-border backdrop-blur-sm">
              <p className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
                Semester 1 · 2026
              </p>
              <div className="mt-3 space-y-2">
                {[
                  ["COMP1100", "Programming as Problem Solving", "emerald"],
                  ["MATH1013", "Mathematics and Applications 1", "sky"],
                  ["COMP1600", "Foundations of Computing", "amber"],
                ].map(([code, name, tone]) => (
                  <div
                    key={code}
                    className="flex items-center gap-3 rounded-xl bg-muted/60 px-3 py-2.5 ring-1 ring-border"
                  >
                    <span
                      className={
                        tone === "emerald"
                          ? "size-2 rounded-full bg-emerald-400"
                          : tone === "sky"
                            ? "size-2 rounded-full bg-sky-400"
                            : "size-2 rounded-full bg-amber-400"
                      }
                    />
                    <span className="font-mono text-xs font-semibold text-foreground">
                      {code}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="absolute -top-4 -right-4 rounded-2xl bg-card px-4 py-3 shadow-md ring-1 ring-border">
              <p className="text-[11px] font-semibold text-muted-foreground">
                Prerequisites met
              </p>
              <p className="mt-0.5 text-lg font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                3 of 3
              </p>
            </div>
          </div>
        </div>
      </aside>
    </main>
  );
}
