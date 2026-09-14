"use client";
import { catalogueWorkspacePath } from "@/lib/coursemap/catalogue-workspace-routes";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CircleX, Download, LoaderCircle, CircleAlert } from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import { AcademicStructureImportPipeline } from "@/ui/admin/imports/academic-structure-import-pipeline";
import { AcademicStructureImportArtifactViewer } from "@/ui/admin/imports/academic-structure-import-artifact-viewer";
import { courseImportEventTitle } from "@/lib/coursemap/course-history";
import type { StructureWorkspaceEntry } from "@/lib/coursemap/structure-workspace-entry";
import type { AcademicStructureImportTargetDetail } from "@/lib/coursemap/admin-academic-structure-imports";

export function StructureImportHistory({
  entry,
  detail,
}: {
  entry: StructureWorkspaceEntry;
  detail: AcademicStructureImportTargetDetail | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const query = useSearchParams();
  function select(key: string, value: string) {
    if (key === "snapshot") {
      const version = entry.versions.find(
        (version) => version.id === Number(value),
      );
      if (version)
        router.push(
          `${catalogueWorkspacePath(pathname)}/versions/${version.public_id}`,
        );
    } else {
      const params = new URLSearchParams(query.toString());
      params.set("import", value);
      router.replace(
        catalogueWorkspacePath(pathname, "history", params.toString()),
        { scroll: false },
      );
    }
  }

  const linked = new Set(
    entry.imports.map((item) => item.candidate_snapshot_id),
  );
  return (
    <div className="min-w-0 shrink-0 space-y-6 pb-2">
      <ol
        aria-label="Import history"
        className="relative min-w-0 before:absolute before:inset-y-4 before:left-4 before:border-l before:border-border"
      >
        {entry.imports.map((item) => (
          <li
            key={item.id}
            className="relative min-w-0 space-y-3 pb-7 pl-12 last:pb-0"
          >
            <span className="absolute top-0 left-0 flex size-8 items-center justify-center rounded-full border border-border bg-background">
              {item.processing_status === "failed" ? (
                <CircleX
                  className="size-4 text-destructive"
                  aria-hidden="true"
                />
              ) : ["queued", "running", "processing"].includes(
                  item.processing_status,
                ) ? (
                <LoaderCircle
                  className="size-4 animate-spin text-primary motion-reduce:animate-none"
                  aria-hidden="true"
                />
              ) : (
                <Download
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
              )}
            </span>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">
                  {courseImportEventTitle(item)}
                </h2>
                <time
                  className="text-xs text-muted-foreground"
                  dateTime={item.created_at}
                >
                  {new Date(item.created_at).toLocaleString("en-AU")}
                </time>
              </div>
              <div className="flex gap-2">
                {detail?.target.id !== item.id ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => select("import", item.id)}
                  >
                    Show details
                  </Button>
                ) : null}
                {item.candidate_snapshot_id ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      select("snapshot", String(item.candidate_snapshot_id))
                    }
                  >
                    View version
                  </Button>
                ) : null}
              </div>
            </div>
            {detail?.target.id === item.id ? (
              <>
                <details
                  open={
                    !!item &&
                    ["queued", "running", "processing"].includes(
                      item.processing_status,
                    )
                  }
                  className="rounded-lg border border-border p-3"
                >
                  <summary className="cursor-pointer text-sm font-medium">
                    Processing details
                    {item.error_summary ? (
                      <CircleAlert
                        className="ml-2 inline size-4 text-destructive"
                        aria-label="Import error"
                      />
                    ) : null}
                  </summary>
                  {item.error_summary ? (
                    <p className="my-3 w-full rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs break-words whitespace-normal text-foreground">
                      {item.error_summary}
                    </p>
                  ) : null}
                  <AcademicStructureImportPipeline
                    contained={false}
                    stages={detail.stages}
                    extractions={detail.extractions}
                  />
                </details>
                <details className="rounded-lg border border-border p-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    Source and extraction artefacts
                  </summary>
                  <div className="flex min-h-96 flex-col md:h-[600px]">
                    <AcademicStructureImportArtifactViewer
                      artifacts={detail.artifacts}
                    />
                  </div>
                </details>
              </>
            ) : null}
          </li>
        ))}
      </ol>
      {entry.versions
        .filter((version) => !linked.has(version.id))
        .map((version) => (
          <div
            key={version.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-border p-4"
          >
            <span>
              {version.origin === "import"
                ? "Imported from ANU"
                : "Content edited"}{" "}
              · {new Date(version.created_at).toLocaleString("en-AU")}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => select("snapshot", String(version.id))}
            >
              View version
            </Button>
          </div>
        ))}
    </div>
  );
}
