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

/** Academic history for a student with a plan but no current or past courses. */
export function ResultsEmptyState() {
  return (
    <Empty className="min-h-96 flex-1 gap-5 rounded-xl border bg-card px-6 py-12">
      <StructureEmptyIllustration kind="results" />
      <EmptyHeader>
        <EmptyTitle className="text-xl">No results yet</EmptyTitle>
        <EmptyDescription className="max-w-sm">
          Courses appear here once their semester starts, ready for your marks.
        </EmptyDescription>
      </EmptyHeader>
      <Button asChild variant="outline">
        <Link href="/plan">
          Open your planner
          <ArrowRight aria-hidden="true" />
        </Link>
      </Button>
    </Empty>
  );
}
