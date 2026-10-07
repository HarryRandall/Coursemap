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
    <Empty className="w-full max-w-xl flex-none gap-6 rounded-2xl border bg-card px-8 py-10 shadow-xl">
      <StructureEmptyIllustration kind={kind} />
      <EmptyHeader>
        <EmptyTitle className="text-2xl font-semibold">
          {available || needsDegree
            ? `No ${kind} selected yet`
            : `No ${kind} options available`}
        </EmptyTitle>
        <EmptyDescription className="max-w-sm text-base">
          {available || needsDegree
            ? descriptions[kind]
            : `There are no ${kind} options to show for this degree.`}
        </EmptyDescription>
      </EmptyHeader>
      {needsDegree ? (
        <Button asChild size="lg" className="h-11 px-5">
          <Link href="/onboarding">
            Set up your plan
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      ) : available && onChoose ? (
        <Button onClick={onChoose} size="lg" className="h-11 px-5">
          Choose a {kind}
          <ArrowRight aria-hidden="true" />
        </Button>
      ) : null}
    </Empty>
  );
}
