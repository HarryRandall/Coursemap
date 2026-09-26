import Link from "next/link";
import { Button } from "@coursemap/ui/primitives/button";
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyTitle,
} from "@coursemap/ui/primitives/empty";
import { cn } from "@/lib/cn";

/**
 * Compact prompt for a page that needs a plan before it can show anything.
 * Pages keep their own layout around it so a new student sees what is coming.
 */
export function OnboardingPrompt({ className }: { className?: string }) {
  return (
    <Empty
      className={cn(
        "rounded-xl border border-dashed bg-card px-6 py-10",
        className,
      )}
    >
      <EmptyHeader>
        <EmptyTitle>Set up your plan</EmptyTitle>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild>
          <Link href="/onboarding">Start onboarding</Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}
