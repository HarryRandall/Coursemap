import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@coursemap/ui/primitives/empty";
import { LoopingPlanIllustration } from "@/ui/common/plan-illustration";
import { SkeletonBackdrop } from "@/ui/common/skeleton-backdrop";
import { cn } from "@/lib/cn";

/**
 * Prompt for a page that needs a plan before it can show anything. Given the
 * page's skeleton as a backdrop, it floats over a faded outline of what the
 * page will hold, so a new student sees its shape around the prompt.
 */
export function OnboardingPrompt({
  backdrop,
  className,
}: {
  backdrop?: ReactNode;
  className?: string;
}) {
  const prompt = (
    <Empty
      className={cn(
        "w-full max-w-xl flex-none gap-6 rounded-2xl border bg-card px-8 py-10 shadow-xl",
        !backdrop && "max-w-none flex-1 shadow-none",
        className,
      )}
    >
      <LoopingPlanIllustration />
      <EmptyHeader className="max-w-md">
        <EmptyTitle className="text-2xl font-semibold">
          Set up your plan first
        </EmptyTitle>
        <EmptyDescription className="text-base">
          Choose your degree and when you started, and Coursemap fills in the
          rest.
        </EmptyDescription>
      </EmptyHeader>
      <div className="flex flex-wrap justify-center gap-3">
        <Button asChild size="lg" className="h-11 px-5">
          <Link href="/onboarding">
            Set up your plan
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="h-11 px-5">
          <Link href="/courses">Browse courses</Link>
        </Button>
      </div>
    </Empty>
  );
  return backdrop ? (
    <SkeletonBackdrop backdrop={backdrop}>{prompt}</SkeletonBackdrop>
  ) : (
    prompt
  );
}
