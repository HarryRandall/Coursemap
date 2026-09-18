import { Badge } from "@coursemap/ui/components/badge";
import type { DirectoryWorkflowStatus } from "@/lib/coursemap/admin-catalogue";
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

const TARGET_STATUS: Record<string, { label: string; tone: Tone }> = {
  queued: { label: "Queued", tone: "info" },
  running: { label: "Running", tone: "info" },
  ready: { label: "Ready for review", tone: "warning" },
  unchanged: { label: "Unchanged", tone: "neutral" },
  failed: { label: "Failed", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  completed: { label: "Completed", tone: "success" },
};

export function TargetStatusBadge({ status }: { status: string }) {
  const meta = TARGET_STATUS[status] ?? {
    label: status,
    tone: "neutral" as Tone,
  };
  return <Badge variant={badgeVariantForTone[meta.tone]}>{meta.label}</Badge>;
}
