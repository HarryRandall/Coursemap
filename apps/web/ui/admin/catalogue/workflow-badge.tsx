import { Badge } from "@coursemap/ui/components/badge";
import { LoaderCircle } from "lucide-react";
import type { DirectoryWorkflowStatus } from "@/lib/coursemap/catalogue-kinds";
import { badgeVariantForTone, type Tone } from "@/lib/ui";

export const WORKFLOW_LABELS: Record<
  DirectoryWorkflowStatus,
  { label: string; tone: Tone; description: string }
> = {
  not_imported: {
    label: "Not imported",
    tone: "neutral",
    description: "Listed on the ANU site but not yet imported.",
  },
  queued: {
    label: "Queued",
    tone: "info",
    description: "Waiting for a worker.",
  },
  running: {
    label: "Importing",
    tone: "info",
    description: "A worker is processing this record.",
  },
  ready: {
    label: "Needs review",
    tone: "warning",
    description: "An import produced a candidate that awaits review.",
  },
  draft: {
    label: "Draft",
    tone: "warning",
    description: "A draft exists but nothing is published.",
  },
  published: {
    label: "Published",
    tone: "success",
    description: "Students see this record.",
  },
  published_with_draft: {
    label: "Published, draft pending",
    tone: "success",
    description: "Published, with a newer draft awaiting review.",
  },
  failed: {
    label: "Failed",
    tone: "danger",
    description: "The latest import failed.",
  },
};

export function WorkflowBadge({ status }: { status: DirectoryWorkflowStatus }) {
  const meta = WORKFLOW_LABELS[status];
  return (
    <Badge variant={badgeVariantForTone[meta.tone]} title={meta.description}>
      {meta.label}
    </Badge>
  );
}

export const TARGET_STATUS: Record<string, { label: string; tone: Tone }> = {
  queued: { label: "Queued", tone: "info" },
  running: { label: "Running", tone: "info" },
  ready: { label: "Ready for review", tone: "warning" },
  unchanged: { label: "Unchanged", tone: "neutral" },
  failed: { label: "Failed", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  completed: { label: "Completed", tone: "success" },
};

/**
 * What the run did to this record. A first import has nothing to compare
 * against, so its changes are accepted and the candidate becomes the draft
 * without anyone pressing Apply; reporting that as "Ready for review" made a
 * record that was already published read as though it still needed a decision.
 */
export function TargetStatusBadge({
  status,
  applied = false,
}: {
  status: string;
  applied?: boolean;
}) {
  const meta =
    applied && status === "ready"
      ? { label: "Applied", tone: "success" as Tone }
      : (TARGET_STATUS[status] ?? {
          label: status,
          tone: "neutral" as Tone,
        });
  return <Badge variant={badgeVariantForTone[meta.tone]}>{meta.label}</Badge>;
}

const RUN_STATUS: Record<string, { label: string; tone: Tone }> = {
  queued: { label: "Queued", tone: "info" },
  running: { label: "Running", tone: "info" },
  completed: { label: "Completed", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

/** Where a batch got to. The spinner repeats "Running" so motion is not the
 * only signal that work is still in flight. */
export function RunStatusBadge({ status }: { status: string }) {
  const meta = RUN_STATUS[status] ?? { label: status, tone: "neutral" as Tone };
  return (
    <Badge variant={badgeVariantForTone[meta.tone]}>
      {status === "running" ? (
        <LoaderCircle size={11} className="animate-spin" aria-hidden="true" />
      ) : null}
      {meta.label}
    </Badge>
  );
}
