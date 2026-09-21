"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { TermChooser } from "@/ui/overlays";
import { CatalogueRowActions } from "@/ui/admin/catalogue-table/catalogue-row-actions";
import type { CourseDetails } from "@/lib/coursemap/course-types";

export function CourseRowActions({
  course,
}: {
  course: Pick<
    CourseDetails,
    "code" | "name" | "sessions" | "sourceUrl" | "year"
  >;
}) {
  const [planOpen, setPlanOpen] = useState(false);
  return (
    <>
      <CatalogueRowActions
        code={course.code}
        links={[
          {
            label: "View course",
            href: `/courses/${course.year}/${course.code.toLowerCase()}`,
          },
          { label: "Open ANU source", href: course.sourceUrl, icon: "source" },
        ]}
        extraActions={[
          {
            label: "Add to plan",
            icon: <Plus />,
            onSelect: () => setPlanOpen(true),
          },
        ]}
      />
      {planOpen ? (
        <TermChooser course={course} onClose={() => setPlanOpen(false)} />
      ) : null}
    </>
  );
}
