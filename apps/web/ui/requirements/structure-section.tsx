"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@coursemap/ui/primitives/card";
import type { StructureSection } from "@/lib/coursemap/structure-types";
import { CatalogueMarkdown } from "@/ui/common/catalogue-markdown";

export function structureSectionAnchor(section: StructureSection) {
  return `section-${section.sectionKey}`;
}

/** One of a structure's fixed information sections, as tidied prose. */
export function StructureSectionCard({
  section,
  academicYear,
  availableCourseCodes,
}: {
  section: StructureSection;
  academicYear: number;
  availableCourseCodes: ReadonlySet<string>;
}) {
  return (
    <Card id={structureSectionAnchor(section)}>
      <CardHeader>
        <CardTitle>
          <h2>{section.heading}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="border-t border-border/60 pt-5">
        <CatalogueMarkdown
          markdown={section.markdown}
          academicYear={academicYear}
          availableCourseCodes={availableCourseCodes}
        />
      </CardContent>
    </Card>
  );
}
