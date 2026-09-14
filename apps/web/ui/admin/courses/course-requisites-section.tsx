"use client";
import type { ReactNode } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import { CourseSourceEvidence } from "./course-source-evidence";
import {
  CourseSnapshotRuleEditor,
  CourseSnapshotRuleViewer,
} from "@/ui/admin/requisites/course-snapshot-rule-editor";
import type { CourseSnapshotProjectionData } from "@/lib/course-import/project-snapshot";
function readable(value: string) {
  const words = value.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function Panel({ children, label }: { children: ReactNode; label: string }) {
  return (
    <section
      aria-label={label}
      className="overflow-hidden rounded-xl border border-border bg-card"
    >
      {children}
    </section>
  );
}

export function RequisitePanel({
  canEdit,
  editing,
  kind,
  onCancelEdit,
  onEdit,
  onSave,
  projection,
  originalSourceTexts,
}: {
  canEdit: boolean;
  editing: boolean;
  kind:
    | "incompatibility"
    | "prerequisite"
    | "corequisite"
    | "permission"
    | "assumed_knowledge";
  onCancelEdit: () => void;
  onEdit: () => void;
  onSave: (projection: CourseSnapshotProjectionData) => Promise<void>;
  projection: CourseSnapshotProjectionData;
  originalSourceTexts: string[];
}) {
  const rules = projection.rules.filter((rule) => rule.ruleKind === kind);
  return (
    <Panel label={readable(kind)}>
      {editing ? (
        <CourseSnapshotRuleEditor
          canEdit={canEdit}
          kind={kind}
          onCancel={onCancelEdit}
          onSave={onSave}
          projection={projection}
          originalSourceTexts={originalSourceTexts}
        />
      ) : rules.length ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
            <h2 className="text-base font-semibold">{readable(kind)}</h2>
            <Button
              disabled={!canEdit}
              onClick={onEdit}
              size="sm"
              variant="outline"
              type="button"
            >
              <Pencil aria-hidden="true" size={14} />
              Edit requisite
            </Button>
          </div>
          <div className="mx-5 mb-3 sm:mx-6">
            <CourseSourceEvidence texts={originalSourceTexts} />
          </div>
          <CourseSnapshotRuleViewer kind={kind} projection={projection} />
        </>
      ) : null}
    </Panel>
  );
}
