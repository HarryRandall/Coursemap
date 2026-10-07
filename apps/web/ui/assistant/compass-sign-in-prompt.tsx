import Link from "next/link";
import { LogIn, UserPlus } from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@coursemap/ui/primitives/empty";
import { CompassIllustration } from "@/ui/common/compass-illustration";
import { AppShell } from "@/ui/shell";

/** Compass for a guest: what it does, and the account it needs. */
export function CompassSignInPrompt() {
  return (
    <AppShell fill>
      <h1 className="sr-only">Compass</h1>
      <Empty className="flex-1 gap-6 rounded-2xl border bg-card px-8 py-12">
        <EmptyMedia>
          <CompassIllustration />
        </EmptyMedia>
        <EmptyHeader className="max-w-md">
          <EmptyTitle className="text-2xl font-semibold">
            Compass needs an account
          </EmptyTitle>
          <EmptyDescription className="text-base">
            Create a free account to ask Compass about your degree. Your guest
            plan moves across with you.
          </EmptyDescription>
        </EmptyHeader>
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild size="lg" className="h-11 px-5">
            <Link href="/signup?next=%2Fcompass%2Fnew">
              <UserPlus aria-hidden="true" />
              Create an account
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-11 px-5">
            <Link href="/login?next=%2Fcompass%2Fnew">
              <LogIn aria-hidden="true" />
              Sign in
            </Link>
          </Button>
        </div>
      </Empty>
    </AppShell>
  );
}
