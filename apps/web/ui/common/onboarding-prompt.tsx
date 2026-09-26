import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@coursemap/ui/primitives/empty";
import { StructureEmptyIllustration } from "@/ui/requirements/structure-empty-illustration";
import { cn } from "@/lib/cn";

/**
 * Prompt for a page that needs a plan before it can show anything. It matches
 * the requirement tabs' empty states and fills the space the content will
 * take, so a new student sees the page's shape around it.
 */
export function OnboardingPrompt({ className }: { className?: string }) {
  return (
    <Empty
      className={cn(
        "min-h-96 flex-1 gap-5 rounded-xl border-2 border-dotted bg-card px-6 py-12",
        className,
      )}
    >
      <StructureEmptyIllustration kind="plan" />
      <EmptyHeader>
        <EmptyTitle className="text-xl">No plan set up yet</EmptyTitle>
        <EmptyDescription className="max-w-sm">
          Choose your degree and when you started.
        </EmptyDescription>
      </EmptyHeader>
      <Button asChild>
        <Link href="/onboarding">
          Set up your plan
          <ArrowRight aria-hidden="true" />
        </Link>
      </Button>
    </Empty>
  );
}
