"use client";
import { useCatalogueAutosave } from "@/ui/admin/imports/use-catalogue-autosave";
import { CourseSourceEvidence } from "@/ui/admin/courses/course-source-evidence";
import { Alert, AlertDescription } from "@coursemap/ui/components/alert";
import { Button } from "@coursemap/ui/primitives/button";
import { Field } from "@coursemap/ui/primitives/field";
import { OptionPicker } from "@/ui/common/option-picker";
import { Textarea } from "@coursemap/ui/primitives/textarea";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@coursemap/ui/primitives/tabs";

import dynamic from "next/dynamic";
import { useMemo, useRef, useState } from "react";
import { AutomaticMapping } from "@/ui/admin/requisites/requisite-automatic-mapping";
import { RequisiteRuleTree } from "@/ui/admin/requisites/requisite-rule-tree";

import { extractAnuCourseCodes } from "@/lib/course-import/course-codes";
import type { CourseSnapshotProjectionData } from "@/lib/course-import/project-snapshot";
import {
  applyRuleTreeToProjection,
  type EditableRuleKind,
} from "@/lib/coursemap/course-snapshot-rule-projection";
import {
  reviewedTreeFromExpression,
  validateReviewedTree,
  type ReviewedRuleTree,
} from "@/lib/coursemap/requisite-conditions";
import { ruleTreeFromProjection } from "@/lib/coursemap/course-rule-review-tree";
import { parseRequisiteSummary } from "@/lib/coursemap/requisite-summary";

const RequisiteRuleGraph = dynamic(
  () =>
    import("@/ui/admin/requisites/requisite-rule-graph").then(
      (module) => module.RequisiteRuleGraph,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-[30rem] place-items-center rounded-lg border border-border bg-muted/50 text-sm text-muted-foreground">
        Loading the diagram...
      </div>
    ),
  },
);

export { applyRuleTreeToProjection };
export type { EditableRuleKind };

function RuleViews({
  canEdit,
  onChange,
  tree,
}: {
  canEdit: boolean;
  onChange: (tree: ReviewedRuleTree) => void;
  tree: ReviewedRuleTree;
}) {
  const [view, setView] = useState<"tree" | "graph">("tree");
  return (
    <Tabs
      onValueChange={(value) => setView(value === "graph" ? "graph" : "tree")}
      value={view}
    >
      <TabsList aria-label="Condition view">
        <TabsTrigger value="tree">Rule builder</TabsTrigger>
        <TabsTrigger value="graph">Diagram</TabsTrigger>
      </TabsList>
      <TabsContent value="tree">
        <RequisiteRuleTree canEdit={canEdit} onChange={onChange} tree={tree} />
      </TabsContent>
      <TabsContent value="graph">
        <RequisiteRuleGraph canEdit={canEdit} onChange={onChange} tree={tree} />
      </TabsContent>
    </Tabs>
  );
}

function UnsupportedConditions({ kinds }: { kinds: string[] }) {
  if (kinds.length === 0) return null;
  return (
    <Alert variant={"warning"}>
      <AlertDescription>
        This rule contains unsupported conditions (
        {[...new Set(kinds)].join(", ")}). They remain in the saved snapshot,
        but cannot be changed in the visual editor.
      </AlertDescription>
    </Alert>
  );
}

export function CourseSnapshotRuleViewer({
  kind,
  projection,
}: {
  kind: EditableRuleKind;
  projection: CourseSnapshotProjectionData;
}) {
  const initial = useMemo(
    () => ruleTreeFromProjection(projection, kind),
    [kind, projection],
  );
  return (
    <div className="space-y-4 px-5 pb-5 sm:px-6">
      <UnsupportedConditions kinds={initial.unsupportedKinds} />
      <RuleViews
        canEdit={false}
        onChange={() => undefined}
        tree={initial.tree}
      />
    </div>
  );
}

export function CourseSnapshotRuleEditor({
  canEdit,
  kind,
  onCancel,
  onSave,
  projection,
  originalSourceTexts = [],
}: {
  canEdit: boolean;
  kind: EditableRuleKind;
  onCancel: () => void;
  onSave: (projection: CourseSnapshotProjectionData) => Promise<void>;
  projection: CourseSnapshotProjectionData;
  originalSourceTexts?: string[];
}) {
  const existingRule = projection.rules.find((rule) => rule.ruleKind === kind);
  const initial = useMemo(
    () => ruleTreeFromProjection(projection, kind),
    [kind, projection],
  );
  const [tree, setTree] = useState(initial.tree);
  const [sourceText, setSourceText] = useState(existingRule?.sourceText ?? "");
  const [hardness, setHardness] = useState<"hard" | "advisory">(
    existingRule?.hardness ??
      (kind === "assumed_knowledge" ? "advisory" : "hard"),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const expression = useMemo(
    () => parseRequisiteSummary(sourceText),
    [sourceText],
  );
  const codes = useMemo(() => extractAnuCourseCodes(sourceText), [sourceText]);

  const lastSaved = useRef(JSON.stringify({ tree, sourceText, hardness }));
  useCatalogueAutosave({ tree, sourceText, hardness }, canEdit, () =>
    save(false),
  );

  async function save(finish = true) {
    const signature = JSON.stringify({ tree, sourceText, hardness });
    if (signature === lastSaved.current) {
      if (finish) onCancel();
      return;
    }
    setError(null);
    if (!sourceText.trim()) {
      setError("Source wording is required.");
      return;
    }
    const validated = validateReviewedTree(tree);
    if ("message" in validated) {
      setError(validated.message);
      return;
    }
    if (validated.tree.children.length === 0) {
      setError("Add at least one condition.");
      return;
    }
    try {
      const next = applyRuleTreeToProjection({
        hardness,
        kind,
        projection,
        sourceText: sourceText.trim(),
        tree: validated.tree,
      });
      setSaving(true);
      await onSave(next);
      lastSaved.current = signature;
      if (finish) onCancel();
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "The rule tree could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 px-5 py-5 sm:px-6">
      <div className="flex justify-end">
        <CourseSourceEvidence texts={originalSourceTexts} />
      </div>
      <UnsupportedConditions kinds={initial.unsupportedKinds} />
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <Field>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">{"Requirement wording"}</span>
            <Textarea
              className="min-h-24"
              disabled={!canEdit}
              onChange={(event) => setSourceText(event.target.value)}
              value={sourceText}
            />
          </label>
        </Field>
        <Field>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">{"Rule strength"}</span>
            <OptionPicker
              value={"coursemap:" + String(hardness)}
              onValueChange={(nextValue) => {
                const option = (
                  [
                    { value: "hard", label: "Hard requirement" },
                    { value: "advisory", label: "Advisory" },
                  ] as const
                ).find(
                  (option) => "coursemap:" + String(option.value) === nextValue,
                );
                if (option) setHardness(option.value);
              }}
              disabled={!canEdit}
              aria-label={"Rule strength"}
              onPointerDown={(event) => event.stopPropagation()}
              placeholder={"Select..."}
              items={[
                { value: "hard", label: "Hard requirement" },
                { value: "advisory", label: "Advisory" },
              ].map((option) => ({
                value: "coursemap:" + String(option.value),
                label: option.label,
              }))}
            />
          </label>
        </Field>
      </div>

      <AutomaticMapping
        canApply={canEdit && initial.unsupportedKinds.length === 0}
        codes={codes}
        expression={expression}
        onApply={() => {
          if (expression) setTree(reviewedTreeFromExpression(expression));
        }}
      />

      <RuleViews
        canEdit={canEdit && initial.unsupportedKinds.length === 0}
        onChange={setTree}
        tree={tree}
      />

      {error ? (
        <Alert variant={"destructive"}>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex justify-end gap-2 border-t border-border/60 pt-4">
        <Button
          disabled={saving}
          onClick={onCancel}
          variant="outline"
          type="button"
        >
          Cancel
        </Button>
        <Button
          disabled={!canEdit || saving || initial.unsupportedKinds.length > 0}
          onClick={() => void save(true)}
          variant="default"
          type="button"
        >
          {saving ? "Saving..." : "Save requisite"}
        </Button>
      </div>
    </div>
  );
}
