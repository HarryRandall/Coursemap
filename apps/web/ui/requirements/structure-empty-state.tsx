"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@coursemap/ui/primitives/empty";
import { StructureEmptyIllustration } from "@/ui/requirements/structure-empty-illustration";
import type { SelectableStructureKind } from "@/lib/coursemap/programme-structure-options";

const descriptions = {
  major: "Pick the direction you want your degree to take.",
  minor: "Explore a second subject alongside your major.",
  specialisation: "Find the area you want to focus on.",
};

export function StructureEmptyState({
  kind,
  available,
  needsDegree = false,
  onChoose,
}: {
  kind: SelectableStructureKind;
  available: boolean;
  needsDegree?: boolean;
  onChoose?: () => void;
}) {
  return (
    <Empty className="min-h-96 flex-1 gap-5 rounded-xl border bg-card px-6 py-12">
      <StructureEmptyIllustration kind={kind} />
      <EmptyHeader>
        <EmptyTitle className="text-xl">
          {available || needsDegree
            ? `No ${kind} selected yet`
            : `No ${kind} options available`}
        </EmptyTitle>
        <EmptyDescription className="max-w-sm">
          {available || needsDegree
            ? descriptions[kind]
            : `There are no ${kind} options to show for this degree.`}
        </EmptyDescription>
      </EmptyHeader>
      {needsDegree ? (
        <Button asChild>
          <Link href="/onboarding">
            Set up your plan
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      ) : available && onChoose ? (
        <Button onClick={onChoose}>
          Choose a {kind}
          <ArrowRight aria-hidden="true" />
        </Button>
      ) : null}
    </Empty>
  );
}
