import type { StructureSection } from "@/lib/coursemap/structure-types";
import { cn } from "@/lib/cn";
import { CatalogueMarkdown } from "@/ui/common/catalogue-markdown";
import { SectionNavigation } from "@/ui/common/section-navigation";

export function structureSectionAnchor(section: StructureSection) {
  return `section-${section.sectionKey}`;
}

/**
 * The sections ANU publishes beyond the requirements, laid out for reading:
 * one column of prose at a measure the eye can follow, with a list of the
 * sections beside it once there are enough to lose one's place among.
 */
export function StructureInformation({
  sections,
  academicYear,
  availableCourseCodes,
}: {
  sections: readonly StructureSection[];
  academicYear: number;
  availableCourseCodes: ReadonlySet<string>;
}) {
  const navigable = sections.length >= 3;
  return (
    <div
      className={cn(
        "grid items-start gap-6",
        navigable && "lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-10",
      )}
    >
      {navigable ? (
        <SectionNavigation
          className="lg:sticky lg:top-4"
          sections={sections.map((section) => ({
            id: structureSectionAnchor(section),
            label: section.heading,
          }))}
        />
      ) : null}
      <div className="max-w-3xl min-w-0 divide-y divide-border">
        {sections.map((section) => (
          <article
            key={section.sectionKey}
            id={structureSectionAnchor(section)}
            aria-labelledby={`${structureSectionAnchor(section)}-heading`}
            className="scroll-mt-28 py-7 first:pt-0 last:pb-0 md:scroll-mt-4"
          >
            <h2
              id={`${structureSectionAnchor(section)}-heading`}
              className="mb-4 text-lg font-semibold tracking-tight text-foreground"
            >
              {section.heading}
            </h2>
            <CatalogueMarkdown
              markdown={section.markdown}
              academicYear={academicYear}
              availableCourseCodes={availableCourseCodes}
              size="md"
            />
          </article>
        ))}
      </div>
    </div>
  );
}
