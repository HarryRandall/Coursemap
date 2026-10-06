import { Button } from "@coursemap/ui/primitives/button";
import Link from "next/link";
import { LandingMark } from "@/ui/landing/landing-mark";

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between border-x border-border px-4 sm:px-6">
        <Link href="/" aria-label="Coursemap home">
          <LandingMark />
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2" aria-label="Landing">
          <Button asChild variant="ghost" size="sm" className="max-sm:hidden">
            <Link href="/courses">Courses</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/signup">Get started</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
