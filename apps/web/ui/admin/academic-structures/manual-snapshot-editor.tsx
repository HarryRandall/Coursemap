"use client";
import { useCatalogueAutosave } from "@/ui/admin/imports/use-catalogue-autosave";
import { Alert, AlertDescription } from "@coursemap/ui/components/alert";
import { Button } from "@coursemap/ui/primitives/button";

import { CircleAlert, Save, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

import { SummaryFieldsEditor, EvidenceEditor } from "./source-fields-editor";
import { saveAcademicStructureManualSnapshot } from "@/lib/coursemap/academic-structure-snapshot-actions";
import type { AdminStructureReviewRecord } from "@/lib/coursemap/admin-catalogue";
import {
  normaliseAcademicStructureManualSnapshotProjection,
  type AcademicStructureManualSnapshotProjection,
} from "@/lib/structure-import/manual-snapshot";

export type StructureEditorSection =
  | "details"
  | "summary"
  | "sections"
  | "outcomes"
  | "fees"
  | "relationships"
  | "requirements"
  | "evidence";

import { DetailsSectionEditor } from "./details-section-editor";

import { ContentSectionEditor } from "./sections-section-editor";

import { OutcomesSectionEditor } from "./outcomes-section-editor";

import { FeesSectionEditor } from "./fees-section-editor";

import { RelationshipsSectionEditor } from "./relationships-section-editor";

import { RequirementsSectionEditor } from "./requirements-section-editor";

type Projection = AcademicStructureManualSnapshotProjection;

export function AcademicStructureManualSnapshotEditor({
  onCancel,
  onSaved,
  record,
  section = "details",
}: {
  onCancel: () => void;
  onSaved: () => void;
  record: AdminStructureReviewRecord;
  section?: StructureEditorSection;
}) {
  const router = useRouter();
  const [projection, setProjection] = useState<Projection>(() =>
    JSON.parse(JSON.stringify(record.projection)),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const baseId = useRef(record.id);
  const lastSaved = useRef(JSON.stringify(projection));
  useCatalogueAutosave(projection, true, () => save(undefined, false));

  async function save(event?: FormEvent<HTMLFormElement>, finish = true) {
    event?.preventDefault();
    if (JSON.stringify(projection) === lastSaved.current) {
      if (finish) onSaved();
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const prepared =
        normaliseAcademicStructureManualSnapshotProjection(projection);
      const result = await saveAcademicStructureManualSnapshot({
        expectedBaseSnapshotId: baseId.current,
        projection: prepared,
        structurePublicId: record.publicId,
        structureYearId: record.structureYearId,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      lastSaved.current = JSON.stringify(projection);
      baseId.current = result.snapshotId ?? baseId.current;
      if (finish) onSaved();
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The edited academic structure is not valid.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={(event) => void save(event)}>
      <p role="status" className="text-xs text-muted-foreground">
        {saving
          ? "Saving…"
          : error
            ? "Changes not saved"
            : "Changes save automatically"}
      </p>
      {section === "details" ? (
        <DetailsSectionEditor
          projection={projection}
          onProjectionChange={setProjection}
        />
      ) : null}

      {section === "summary" ? (
        <SummaryFieldsEditor
          onProjectionChange={setProjection}
          projection={projection}
        />
      ) : null}

      {section === "sections" ? (
        <ContentSectionEditor
          projection={projection}
          onProjectionChange={setProjection}
        />
      ) : null}

      {section === "evidence" ? (
        <EvidenceEditor
          onProjectionChange={setProjection}
          projection={projection}
        />
      ) : null}

      {section === "outcomes" ? (
        <OutcomesSectionEditor
          projection={projection}
          onProjectionChange={setProjection}
        />
      ) : null}

      {section === "fees" ? (
        <FeesSectionEditor
          projection={projection}
          onProjectionChange={setProjection}
        />
      ) : null}

      {section === "relationships" ? (
        <RelationshipsSectionEditor
          projection={projection}
          onProjectionChange={setProjection}
        />
      ) : null}

      {section === "requirements" ? (
        <RequirementsSectionEditor
          projection={projection}
          onProjectionChange={setProjection}
        />
      ) : null}

      {error ? (
        <Alert variant={"destructive"}>
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="sticky bottom-4 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-border bg-card/80 p-3 shadow-lg backdrop-blur">
        <Button
          disabled={saving}
          onClick={onCancel}
          variant="outline"
          type="button"
        >
          <X aria-hidden="true" size={15} />
          Cancel
        </Button>
        <Button disabled={saving} type="submit" variant="default">
          <Save aria-hidden="true" size={15} />
          {saving ? "Saving draft..." : "Save section"}
        </Button>
      </div>
    </form>
  );
}
