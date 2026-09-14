"use client";

import { catalogueWorkspacePath } from "@/lib/coursemap/catalogue-workspace-routes";
import { useRouter } from "next/navigation";
import { Download, Pencil, CircleX, CircleAlert } from "lucide-react";
import { Badge } from "@coursemap/ui/components/badge";
import { Button } from "@coursemap/ui/primitives/button";
import { CourseImportPipeline } from "@/ui/admin/imports/course-import-pipeline";
import { CourseImportArtifactViewer } from "@/ui/admin/imports/course-import-artifact-viewer";
import { courseHistoryEvents } from "@/lib/coursemap/course-history";
import type { CourseWorkspaceImport } from "@/lib/coursemap/course-workspace-entry";
import type { CourseImportTargetDetail } from "@/lib/coursemap/admin-course-imports";
import type { AdminCourseSnapshotOption } from "@/lib/coursemap/admin-course-year";

export function CourseImportHistory({
  imports,
  versions,
  detail,
  publishedSnapshotId,
  draftSnapshotId,
  onInspectSnapshot,
}: {
  imports: CourseWorkspaceImport[];
  versions: AdminCourseSnapshotOption[];
  detail: CourseImportTargetDetail | null;
  publishedSnapshotId: number | null;
  draftSnapshotId: number | null;
  onInspectSnapshot: (id: number) => void;
}) {
  const router = useRouter();
  const events = courseHistoryEvents(imports, versions);
  return (
    <ol
      className="relative min-w-0 before:absolute before:inset-y-4 before:left-4 before:border-l before:border-border"
      aria-label="Course history"
    >
      {events.map((event) => {
        const item = event.imported;
        const selected = !!item && detail?.target.id === item.id;
        const snapshotId = event.version?.id ?? item?.candidate_snapshot_id;
        const Icon =
          item?.processing_status === "failed"
            ? CircleX
            : item || event.version?.origin === "import"
              ? Download
              : Pencil;
        return (
          <li key={event.id} className="relative min-w-0 pb-7 pl-12 last:pb-0">
            <span className="absolute top-0 left-0 flex size-8 items-center justify-center rounded-full border border-border bg-background">
              <Icon
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
            </span>
            <div className="space-y-3 pt-1">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold">{event.title}</h2>
                    {snapshotId && snapshotId === publishedSnapshotId ? (
                      <Badge variant="success-light">Published</Badge>
                    ) : snapshotId && snapshotId === draftSnapshotId ? (
                      <Badge variant="outline">Current draft</Badge>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {event.version
                      ? `Version ${event.version.snapshotNumber} · `
                      : null}
                    <time dateTime={event.createdAt}>
                      {new Date(event.createdAt).toLocaleString("en-AU", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </time>
                  </p>
                </div>
                <div className="flex gap-2">
                  {item && !selected ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const query = new URLSearchParams(
                          window.location.search,
                        );
                        query.set("import", item.id);
                        router.push(
                          catalogueWorkspacePath(
                            window.location.pathname,
                            "history",
                            query.toString(),
                          ),
                          {
                            scroll: false,
                          },
                        );
                      }}
                    >
                      Show details
                    </Button>
                  ) : null}
                  {snapshotId ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onInspectSnapshot(snapshotId)}
                    >
                      View version
                    </Button>
                  ) : null}
                </div>
              </div>
              {selected && detail ? (
                <div className="space-y-2">
                  <details
                    open={
                      !!item &&
                      ["queued", "running", "processing"].includes(
                        item.processing_status,
                      )
                    }
                    className="rounded-lg border border-border"
                  >
                    <summary className="cursor-pointer p-3 text-sm font-medium">
                      Processing details
                      {item?.error_summary ? (
                        <CircleAlert
                          className="ml-2 inline size-4 text-destructive"
                          aria-label="Import error"
                        />
                      ) : null}
                    </summary>
                    <div className="space-y-3 p-3 pt-0">
                      {item?.error_summary ? (
                        <p className="w-full rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs break-words whitespace-normal text-foreground">
                          {item.error_summary}
                        </p>
                      ) : null}
                      <CourseImportPipeline
                        stages={detail.stages}
                        extractions={detail.extractions}
                        contained={false}
                      />
                    </div>
                  </details>
                  <details className="rounded-lg border border-border">
                    <summary className="cursor-pointer p-3 text-sm font-medium">
                      Source and extraction artefacts
                    </summary>
                    <div className="flex min-h-96 flex-col p-3 pt-0 md:h-[600px]">
                      <CourseImportArtifactViewer
                        artifacts={detail.artifacts}
                      />
                    </div>
                  </details>
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
