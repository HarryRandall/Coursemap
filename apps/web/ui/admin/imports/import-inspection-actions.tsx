"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  ExternalLink,
  LoaderCircle,
  MoreHorizontal,
  RotateCcw,
} from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@coursemap/ui/primitives/dropdown-menu";
import type { AcademicStructureKind } from "@/lib/structure-import/contract";
import { catalogueWorkspacePath } from "@/lib/coursemap/catalogue-workspace-routes";

export function ImportInspectionActions({
  code,
  academicYear,
  requestedModel,
  structureKind,
  active,
  workspaceHref,
}: {
  code: string;
  academicYear: number;
  requestedModel: string;
  structureKind?: AcademicStructureKind;
  active: boolean;
  workspaceHref: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);

  async function retry() {
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError(null);
    try {
      // A retry creates a new attempt; the inspected run stays immutable.
      const response = await fetch(
        structureKind
          ? "/api/admin/academic-structure-imports"
          : "/api/admin/course-imports",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            academicYear,
            requestedModel,
            ...(structureKind
              ? { structureKind, structureCodes: [code] }
              : { courseCodes: [code] }),
          }),
        },
      );
      const result = await response.json().catch(() => ({
        error: "The import service returned an unreadable response. Try again.",
      }));
      if (!response.ok) {
        throw new Error(result.error ?? "The import could not be retried.");
      }
      const targetId = result.targets?.[0]?.targetId;
      if (!targetId) throw new Error("The new import target was not returned.");
      if (!workspaceHref)
        throw new Error("The catalogue workspace is unavailable.");
      router.push(
        catalogueWorkspacePath(workspaceHref, "history", `import=${targetId}`),
      );
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The import could not be retried.",
      );
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {error ? (
        <p role="alert" className="max-w-sm text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Import actions for ${code}`}
            aria-busy={pending}
          >
            {pending ? (
              <LoaderCircle
                aria-hidden="true"
                size={18}
                className="animate-spin motion-reduce:animate-none"
              />
            ) : (
              <MoreHorizontal aria-hidden="true" size={18} />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={active || pending}
            onSelect={() => void retry()}
          >
            <RotateCcw aria-hidden="true" />
            {pending ? "Retrying..." : "Retry import"}
          </DropdownMenuItem>
          {workspaceHref ? (
            <DropdownMenuItem asChild>
              <Link href={workspaceHref}>
                <ExternalLink aria-hidden="true" />
                Open workspace
              </Link>
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {pending ? (
        <span role="status" className="sr-only">
          Retrying import...
        </span>
      ) : null}
    </div>
  );
}
