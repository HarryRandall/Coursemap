"use client";

import { Button } from "@coursemap/ui/primitives/button";
import { Textarea } from "@coursemap/ui/primitives/textarea";
import { useState } from "react";

import type { RequirementRuleKind } from "@/lib/catalogue/content";
import {
  catalogueContentWithRecordedRule,
  recordedRuleContent,
} from "@/lib/catalogue/recorded-rule";
import { useCatalogueEditor } from "./catalogue-editor-context";

export function RecordedRuleEditor({
  ruleKey,
}: {
  ruleKey: RequirementRuleKind;
}) {
  const { write, setWrite } = useCatalogueEditor();
  const [baseline, setBaseline] = useState(() =>
    JSON.stringify(recordedRuleContent(write, ruleKey)),
  );
  const [draft, setDraft] = useState(() =>
    JSON.stringify(recordedRuleContent(write, ruleKey), null, 2),
  );
  const [error, setError] = useState<string | null>(null);
  const id = `recorded-rule-${ruleKey}`;

  function apply() {
    try {
      let submitted: unknown;
      try {
        submitted = JSON.parse(draft);
      } catch {
        throw new TypeError(
          "Enter valid JSON before applying the corrected rule.",
        );
      }
      // Validate before entering React's updater. The updater merges with the
      // current record so unrelated edits made during typing are retained.
      const corrected = catalogueContentWithRecordedRule(
        write,
        ruleKey,
        submitted,
        baseline,
      );
      setWrite((current) =>
        catalogueContentWithRecordedRule(current, ruleKey, submitted, baseline),
      );
      setBaseline(JSON.stringify(recordedRuleContent(corrected, ruleKey)));
      setDraft(
        JSON.stringify(recordedRuleContent(corrected, ruleKey), null, 2),
      );
      setError(null);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The corrected rule could not be applied.",
      );
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor={id} className="text-xs font-medium">
        Recorded rule JSON
      </label>
      <Textarea
        id={id}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setError(null);
        }}
        className="min-h-64 font-mono text-xs"
        spellCheck={false}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={apply}>
          Apply corrected rule
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const current = recordedRuleContent(write, ruleKey);
            setBaseline(JSON.stringify(current));
            setDraft(JSON.stringify(current, null, 2));
            setError(null);
          }}
        >
          Reset recorded rule
        </Button>
      </div>
    </div>
  );
}
