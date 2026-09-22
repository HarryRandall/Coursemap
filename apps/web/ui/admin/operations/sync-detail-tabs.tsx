"use client";

import { Tabs } from "@coursemap/ui/primitives/tabs";
import { useState, type ReactNode } from "react";
import { SectionTabs } from "@/ui/common/section-tabs";

export type SyncDetailSection =
  "overview" | "stages" | "extractions" | "artefacts";

/**
 * One sync's diagnostics, split by the question being asked of it: what it
 * was, where it stopped, what the model cost, and what it captured. The whole
 * record used to be a single scroll, so the failing stage sat below several
 * screens of contract versions and the artefact viewer never had the page to
 * itself.
 *
 * The section is held here rather than in the URL: it is a place to look
 * while reading one sync, not a page worth linking to on its own.
 */
export function SyncDetailTabs({ children }: { children: ReactNode }) {
  const [section, setSection] = useState<SyncDetailSection>("overview");
  return (
    <Tabs
      className="block"
      value={section}
      onValueChange={(next) => setSection(next as SyncDetailSection)}
    >
      {children}
    </Tabs>
  );
}

export function SyncDetailTabList({
  stageCount,
  extractionCount,
  artefactCount,
  failedStageCount,
}: {
  stageCount: number;
  extractionCount: number;
  artefactCount: number;
  failedStageCount: number;
}) {
  return (
    <SectionTabs
      label="Sync diagnostics"
      tabs={[
        { value: "overview", label: "Overview" },
        {
          value: "stages",
          label: "Stages",
          count: failedStageCount,
          disabled: stageCount === 0,
        },
        {
          value: "extractions",
          label: "Extractions",
          disabled: extractionCount === 0,
        },
        {
          value: "artefacts",
          label: "Artefacts",
          disabled: artefactCount === 0,
        },
      ]}
    />
  );
}
