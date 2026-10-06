import { Button } from "@coursemap/ui/primitives/button";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LandingGridBackground } from "@/ui/landing/landing-grid-background";
import { LandingMark } from "@/ui/landing/landing-mark";

export function LandingFooter() {
  return (
    <footer>
      <section className="relative isolate border-b border-border">
        <LandingGridBackground />
        <div className="relative mx-auto flex max-w-6xl flex-col items-start gap-6 border-x border-border px-4 py-16 sm:px-10 sm:py-24">
          <h2 className="max-w-xl text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl">
            Start with a course, then build the rest.
          </h2>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/signup">
                Create a free account
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/courses">Browse without an account</Link>
            </Button>
          </div>
        </div>
      </section>
      <div className="mx-auto flex max-w-6xl flex-col gap-4 border-x border-border px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-10">
        <LandingMark wordmarkClassName="text-base" />
        <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
          Coursemap is an independent planning tool. It is not an official ANU
          system and does not replace the Programs and Courses catalogue or
          academic advice.
        </p>
      </div>
    </footer>
  );
}
