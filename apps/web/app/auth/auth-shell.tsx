import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { LandingGridBackground } from "@/ui/landing/landing-grid-background";
import { LandingMark } from "@/ui/landing/landing-mark";
import { LandingAuthStory } from "@/ui/landing/landing-auth-story";
import { LandingHelp } from "@/ui/landing/landing-help";
import type { ShowcaseCourse } from "@/lib/coursemap/landing-courses";
import { LandingReveal } from "@/ui/landing/landing-reveal";

const delay = (ms: number) => ({ "--enter-delay": `${ms}ms` }) as CSSProperties;

/**
 * Sign-in and sign-up layout, on the landing page's bordered column so it
 * keeps its shape at any width or zoom: the form on the left, and on the
 * right a year planning itself in turn with real prerequisite examples. The
 * preview is hidden on small screens, so everything needed to sign in lives
 * in the form column.
 */
export function AuthShell({
  children,
  courses = [],
}: {
  children: ReactNode;
  /** Prerequisite examples for the side panel; none shows only the plan. */
  courses?: readonly ShowcaseCourse[];
}) {
  return (
    <main className="landing-surface flex min-h-dvh flex-col bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between border-x border-border px-4 sm:px-6">
          <Link href="/" aria-label="Coursemap home">
            <LandingMark />
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Back to home
          </Link>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-px border-x border-border bg-border lg:grid-cols-2">
        <section className="flex items-center justify-center bg-background px-5 py-12 sm:px-10">
          <div className="w-full max-w-sm">{children}</div>
        </section>

        <aside
          aria-label="Coursemap preview"
          className="relative isolate hidden overflow-hidden bg-background lg:block"
        >
          <LandingGridBackground edge="box" />
          <LandingReveal className="relative flex h-full flex-col gap-6 px-10 py-14">
            <div>
              <h2 className="enter-rise text-3xl leading-tight font-semibold tracking-tight text-balance text-foreground">
                Every course, every prerequisite, one plan.
              </h2>
              <p
                className="enter-rise mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground"
                style={delay(80)}
              >
                Each semester filled course by course, with every requirement
                checked as you go.
              </p>
            </div>
            <div
              className="enter-rise relative min-h-[42rem] flex-1"
              style={delay(160)}
            >
              <LandingAuthStory courses={courses} />
            </div>
          </LandingReveal>
        </aside>
      </div>

      <footer className="border-t border-border">
        <p className="mx-auto max-w-6xl border-x border-border px-4 py-4 text-[11px] leading-relaxed text-muted-foreground sm:px-6">
          Coursemap is an independent planning tool. It is not an official ANU
          system and does not replace Programs and Courses or academic advice.
        </p>
      </footer>
      <LandingHelp />
    </main>
  );
}
