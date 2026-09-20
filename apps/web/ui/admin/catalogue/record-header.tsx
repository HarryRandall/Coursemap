"use client";

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@coursemap/ui/components/alert";
import { Badge } from "@coursemap/ui/components/badge";
import { Button } from "@coursemap/ui/primitives/button";
import { Progress } from "@coursemap/ui/primitives/progress";
import {
  CircleCheck,
  ExternalLink,
  Info,
  ListChecks,
  LoaderCircle,
  Send,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";

import {
  publishDraftAction,
  unpublishAction,
} from "@/lib/coursemap/admin-catalogue-actions";
import type { CatalogueRecord } from "@/lib/coursemap/admin-catalogue-record";
import { CATALOGUE_KIND_LABELS } from "@/lib/coursemap/catalogue-kinds";
import { ConfirmDialog } from "@/ui/common/confirm-dialog";
import { anuSourceUrl } from "./anu-source";
import { type RecordStep, recordNextStep } from "./review-state";
import { WorkflowBadge } from "./workflow-badge";

/** Title, pointers, the verdict and the publish controls for one record and year. */
export function RecordHeader({
  record,
  path,
}: {
  record: CatalogueRecord;
  path: string;
}) {
  const [pending, startTransition] = useTransition();
  const labels = CATALOGUE_KIND_LABELS[record.kind];
  const step = recordNextStep(record);
  const workflow =
    record.publishedSnapshotId && record.draftSnapshotId
      ? "published_with_draft"
      : record.publishedSnapshotId
        ? "published"
        : record.draftSnapshotId
          ? "draft"
          : "not_imported";

  function run(
    action: () => Promise<{ ok: boolean; error?: string; message?: string }>,
  ) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(result.message ?? "Done.");
      else toast.error(result.error ?? "The action failed.");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <header
        role="banner"
        className="flex flex-wrap items-start justify-between gap-4"
      >
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-mono text-sm text-muted-foreground">
            {labels.singular} · {record.code} · {record.academicYear}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {record.title}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <WorkflowBadge status={workflow} />
            {record.archivedAt ? (
              <Badge variant="outline">Archived</Badge>
            ) : null}
            <Link
              className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
              href={anuSourceUrl(record)}
              target="_blank"
              rel="noreferrer"
            >
              ANU page
              <ExternalLink size={12} aria-hidden="true" />
            </Link>
          </div>
        </div>
        {record.publishedSnapshotId ? (
          <ConfirmDialog
            title={`Unpublish ${record.code} for ${record.academicYear}?`}
            description="Students will no longer see this record for the year. The content stays in history and can be published again."
            confirmLabel="Unpublish"
            destructive
            onConfirm={() =>
              run(() =>
                unpublishAction({ itemYearId: record.itemYearId, path }),
              )
            }
            trigger={
              <Button variant="outline" disabled={pending} type="button">
                <Undo2 size={16} aria-hidden="true" />
                Unpublish
              </Button>
            }
          />
        ) : null}
      </header>
      <NextStep
        pending={pending}
        path={path}
        record={record}
        run={run}
        step={step}
      />
    </div>
  );
}

const STEP_VARIANTS = {
  success: "success",
  warning: "warning",
  info: "info",
  neutral: "default",
} as const;

/**
 * The verdict on the record and the one control that moves it forward. It
 * carries the reason a draft is held back as well, because why a record cannot
 * go live is the most important thing on the page and used to be the faintest
 * line of text on it.
 */
function NextStep({
  pending,
  path,
  record,
  run,
  step,
}: {
  pending: boolean;
  path: string;
  record: CatalogueRecord;
  run: (
    action: () => Promise<{ ok: boolean; error?: string; message?: string }>,
  ) => void;
  step: RecordStep;
}) {
  const Icon =
    step.tone === "success"
      ? CircleCheck
      : step.tone === "warning"
        ? TriangleAlert
        : step.tone === "info"
          ? Info
          : ListChecks;
  return (
    <Alert variant={STEP_VARIANTS[step.tone]}>
      <Icon className="size-4" aria-hidden="true" />
      <AlertTitle>{step.headline}</AlertTitle>
      <AlertDescription>
        {step.detail ? <p>{step.detail}</p> : null}
        {step.blockers.length > 0 ? (
          <ul className="list-disc space-y-0.5 pl-4">
            {step.blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        ) : null}
        {step.decisions > 0 && step.decided < step.decisions ? (
          <div className="mt-1 flex w-full max-w-sm items-center gap-2">
            <Progress
              aria-label={`${step.decided} of ${step.decisions} decided`}
              className="w-32"
              value={(step.decided / step.decisions) * 100}
            />
            <span className="text-xs tabular-nums">
              {step.decided} of {step.decisions} decided
            </span>
          </div>
        ) : null}
      </AlertDescription>
      <AlertAction>
        {step.next === "publish" ? (
          <ConfirmDialog
            confirmLabel="Publish"
            description={
              record.publishedSnapshotId
                ? `The draft replaces the ${record.academicYear} record students see for ${record.code}. The version it replaces stays in history.`
                : `${record.code} becomes visible to students for ${record.academicYear}. It can be unpublished again from this page.`
            }
            onConfirm={() =>
              run(() =>
                publishDraftAction({ itemYearId: record.itemYearId, path }),
              )
            }
            title={`Publish ${record.code} for ${record.academicYear}?`}
            trigger={
              <Button disabled={pending} type="button">
                {pending ? (
                  <LoaderCircle
                    size={16}
                    className="animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Send size={16} aria-hidden="true" />
                )}
                Publish draft
              </Button>
            }
          />
        ) : step.next === "review" ? (
          <Button asChild size="sm" variant="outline">
            <Link href={`${path}&tab=review`}>Open review</Link>
          </Button>
        ) : null}
      </AlertAction>
    </Alert>
  );
}
