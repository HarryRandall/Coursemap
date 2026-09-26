"use client";

import { Tabs, TabsList, TabsTrigger } from "@coursemap/ui/primitives/tabs";
import { useMemo, useState } from "react";

import type { CatalogueContent } from "@/lib/catalogue/content";
import type { CourseDetails } from "@/lib/coursemap/course-types";
import {
  sampleStudent,
  type SampleStudent,
} from "@/lib/coursemap/requisite-samples";
import { structureDetailsFromWrite } from "@/lib/coursemap/structure-version-view";
import {
  CourseDetailTabsList,
  CourseDetailView,
  type CourseTab,
} from "@/ui/courses/course-detail-view";
import { readingTreeContext } from "@/ui/requirements/requirement-presentation";
import {
  StructureDetailTabsList,
  StructureDetailView,
  type StructureTab,
} from "@/ui/requirements/structure-detail-view";

const EMPTY = { completedCourses: [], isAuthenticated: false };

const PREVIEW_READERS = [
  { value: "signed-out", label: "Signed out" },
  { value: "new", label: "New student" },
  { value: "partway", label: "Partway" },
  { value: "complete", label: "Meets everything" },
] as const;

type PreviewReader = (typeof PREVIEW_READERS)[number]["value"];

/**
 * The student view of a course snapshot, rendered from its projection. The
 * reader switch fills the requisites with a made-up student built from this
 * course's own rule, so every progress state can be checked without a real
 * record.
 */
export function CoursePreview({ course }: { course: CourseDetails }) {
  const [tab, setTab] = useState<CourseTab>("overview");
  const [reader, setReader] = useState<PreviewReader>("signed-out");
  const rule = course.prerequisiteRule?.relationalExpression ?? null;
  const student = useMemo(
    () =>
      reader === "signed-out"
        ? null
        : sampleStudent(rule, reader as SampleStudent),
    [reader, rule],
  );
  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as CourseTab)}
      className="block"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 overflow-x-auto">
        <CourseDetailTabsList />
        <Tabs
          value={reader}
          onValueChange={(value) => setReader(value as PreviewReader)}
        >
          <TabsList aria-label="Preview as">
            {PREVIEW_READERS.map((option) => (
              <TabsTrigger key={option.value} value={option.value}>
                {option.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      <CourseDetailView
        course={course}
        previewStudent={student}
        requisiteCompletion={EMPTY}
      />
    </Tabs>
  );
}

/**
 * The reader's view of a structure snapshot, through the same component the
 * published page uses. A reviewer judges the requirement tree as a student
 * will read it rather than as stored JSON.
 */
export function StructurePreview({ write }: { write: CatalogueContent }) {
  const [tab, setTab] = useState<StructureTab>("overview");
  const structure = structureDetailsFromWrite(write);
  if (!structure) return null;
  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as StructureTab)}
      className="block"
    >
      <div className="mb-4 overflow-x-auto">
        <StructureDetailTabsList />
      </div>
      <StructureDetailView
        structure={structure}
        treeContext={readingTreeContext({
          academicYear: structure.year,
          unitTarget: structure.units,
        })}
      />
    </Tabs>
  );
}
