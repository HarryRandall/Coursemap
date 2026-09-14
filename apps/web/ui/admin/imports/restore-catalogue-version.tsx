"use client";
import { useRouter } from "next/navigation";
import { Button } from "@coursemap/ui/primitives/button";
import { ConfirmDialog } from "@/ui/common/confirm-dialog";
import { restoreCatalogueVersion } from "@/lib/coursemap/catalogue-section-review-actions";

export function RestoreCatalogueVersion({
  kind,
  yearId,
  versionId,
  expectedSnapshotId,
  workspaceHref,
}: {
  kind: string;
  yearId: number;
  versionId: string;
  expectedSnapshotId: number;
  workspaceHref: string;
}) {
  const router = useRouter();
  return (
    <ConfirmDialog
      title="Restore this version?"
      description="This replaces working content. Changed sections need review and the published version stays live."
      confirmLabel="Restore version"
      onConfirm={async () => {
        await restoreCatalogueVersion({
          kind,
          yearId,
          versionId,
          expectedSnapshotId,
        });
        router.push(workspaceHref);
        router.refresh();
      }}
      trigger={
        <Button variant="outline" size="sm">
          Restore this version
        </Button>
      }
    />
  );
}
