"use client";

import { Tabs } from "@coursemap/ui/primitives/tabs";
import { useState } from "react";

import type { CatalogueSnapshotWrite } from "@/lib/catalogue-import/snapshot-write";
import type { CourseDetails } from "@/lib/coursemap/course-types";
import { structureDetailsFromWrite } from "@/lib/coursemap/structure-snapshot-view";
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

/** The student view of a course snapshot, rendered from its projection. */
export function CoursePreview({ course }: { course: CourseDetails }) {
  const [tab, setTab] = useState<CourseTab>("overview");
  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as CourseTab)}
      className="block"
    >
      <div className="mb-4 overflow-x-auto">
        <CourseDetailTabsList />
      </div>
      <CourseDetailView course={course} requisiteCompletion={EMPTY} />
    </Tabs>
  );
}

/**
 * The reader's view of a structure snapshot, through the same component the
 * published page uses. A reviewer judges the requirement tree as a student
 * will read it rather than as stored JSON.
 */
export function StructurePreview({ write }: { write: CatalogueSnapshotWrite }) {
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
