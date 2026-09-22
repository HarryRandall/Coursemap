"use client";

import { Tabs, TabsList, TabsTrigger } from "@coursemap/ui/primitives/tabs";
import { useState } from "react";
import type { CatalogueContent } from "@/lib/catalogue/content";
import type { CourseDetails } from "@/lib/coursemap/course-types";
import { CoursePreview, StructurePreview } from "./version-preview";

export type StudentPreviewSource = {
  /** Present for courses; structures render from their content instead. */
  course: CourseDetails | null;
  content: CatalogueContent | null;
};

function Preview({ source }: { source: StudentPreviewSource }) {
  if (source.course) return <CoursePreview course={source.course} />;
  if (source.content) return <StructurePreview write={source.content} />;
  return null;
}

/**
 * What students will read, from the draft or from the publication. The draft
 * leads because the question an administrator is asking is what publishing
 * would do, and both sides render through the same components as the public
 * page so a preview cannot quietly drift from it.
 */
export function StudentViewPanel({
  draft,
  published,
  kindLabel,
}: {
  draft: StudentPreviewSource | null;
  published: StudentPreviewSource | null;
  kindLabel: string;
}) {
  const [view, setView] = useState<"draft" | "published">(
    draft ? "draft" : "published",
  );

  if (!draft && !published) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <h2 className="font-semibold">Nothing to preview yet</h2>
        <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">
          {`Sync from ANU or write the ${kindLabel} content, and this is what students will read.`}
        </p>
      </div>
    );
  }

  if (!draft || !published) {
    const only = draft ?? published!;
    return (
      <div className="flex flex-col gap-4">
        {draft ? (
          <p className="text-sm text-muted-foreground">
            {`This ${kindLabel} hasn't been published yet. Students see nothing until you publish.`}
          </p>
        ) : null}
        <Preview source={only} />
      </div>
    );
  }

  return (
    <Tabs
      className="flex flex-col gap-4"
      onValueChange={(value) => setView(value as "draft" | "published")}
      value={view}
    >
      <TabsList aria-label="Preview content" className="w-fit">
        <TabsTrigger value="draft">Draft</TabsTrigger>
        <TabsTrigger value="published">Published</TabsTrigger>
      </TabsList>
      <Preview source={view === "draft" ? draft : published} />
    </Tabs>
  );
}
