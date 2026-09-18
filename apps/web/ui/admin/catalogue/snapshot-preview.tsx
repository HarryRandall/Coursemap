"use client";

import { Tabs } from "@coursemap/ui/primitives/tabs";
import { useState } from "react";

import type { CatalogueSnapshotWrite } from "@/lib/catalogue-import/snapshot-write";
import type { CourseDetails } from "@/lib/coursemap/course-types";
import {
  CourseDetailTabsList,
  CourseDetailView,
  type CourseTab,
} from "@/ui/courses/course-detail-view";
import { JsonCode } from "@/ui/common/json-code";

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

/** A readable rendering of a structure snapshot until the student pages exist. */
export function StructurePreview({ write }: { write: CatalogueSnapshotWrite }) {
  const structure = write.structure;
  if (!structure) return null;
  const details = structure.details;
  const facts = [
    ["Units", details.units],
    [
      "Duration",
      details.durationYears ? `${details.durationYears} years` : null,
    ],
    ["Career", details.academicCareer],
    ["College", details.college],
    ["Delivery", details.modeOfDelivery],
    ["Selection rank", details.selectionRank],
    ["ATAR", details.atar],
  ].filter(
    ([, value]) => value !== null && value !== undefined && value !== "",
  );
  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">{details.name}</h2>
        {details.introduction ? (
          <p className="text-muted-foreground">{details.introduction}</p>
        ) : null}
        {facts.length ? (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-4">
            {facts.map(([label, value]) => (
              <div key={String(label)}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd>{String(value)}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </header>
      {details.description ? (
        <section>
          <h3 className="mb-1 text-sm font-semibold">Description</h3>
          <p className="text-sm whitespace-pre-wrap">{details.description}</p>
        </section>
      ) : null}
      {structure.sections.map((section) => (
        <section key={section.sectionKey}>
          <h3 className="mb-1 text-sm font-semibold">{section.heading}</h3>
          <div className="text-sm whitespace-pre-wrap">{section.markdown}</div>
        </section>
      ))}
      {structure.learningOutcomes.length ? (
        <section>
          <h3 className="mb-1 text-sm font-semibold">Learning outcomes</h3>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {structure.learningOutcomes.map((outcome) => (
              <li key={outcome.position}>{outcome.outcomeText}</li>
            ))}
          </ol>
        </section>
      ) : null}
      {structure.relationships.length ? (
        <section>
          <h3 className="mb-1 text-sm font-semibold">Related structures</h3>
          <ul className="space-y-1 text-sm">
            {structure.relationships.map((relationship) => (
              <li
                key={`${relationship.targetKind}-${relationship.targetCode}-${relationship.position}`}
              >
                <span className="font-mono">{relationship.targetCode}</span>{" "}
                {relationship.targetTitle ?? ""}{" "}
                <span className="text-muted-foreground">
                  ({relationship.targetKind}, {relationship.relationshipKind})
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {write.requirements.rules.length ? (
        <section>
          <h3 className="mb-1 text-sm font-semibold">Requirements</h3>
          <p className="mb-2 text-sm text-muted-foreground">
            {write.requirements.rules[0]?.sourceText}
          </p>
          <JsonCode label="Requirement tree" value={write.requirements} />
        </section>
      ) : null}
    </article>
  );
}
