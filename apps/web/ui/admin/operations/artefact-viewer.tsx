"use client";

import { useMemo, useState } from "react";
import { CircleQuestionMark, LoaderCircle } from "lucide-react";
import { Alert, AlertDescription } from "@coursemap/ui/components/alert";
import { Button } from "@coursemap/ui/primitives/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@coursemap/ui/primitives/tabs";
import { Hint } from "@/ui/common/hint";
import { OptionPicker } from "@/ui/common/option-picker";
import { JsonCode } from "@/ui/common/json-code";
import { ArtefactViewport } from "./artefact-viewport";
import {
  groupSyncArtefactSummarys,
  syncArtefactDescriptions,
  syncArtefactLabels,
  parseSyncArtefactSummary,
  type SyncArtefactSummary,
} from "./artefact-data";
import { useSyncArtefactSummary } from "./use-artefact";
import { SourceCode } from "./source-code";
import navigationStyles from "./artefact-navigation.module.css";

export function ArtefactViewer({
  artifacts,
  endpoint,
}: {
  artifacts: SyncArtefactSummary[];
  endpoint: string;
}) {
  const grouped = useMemo(
    () => groupSyncArtefactSummarys(artifacts),
    [artifacts],
  );
  const [activeKind, setActiveKind] = useState("");
  const [attempts, setAttempts] = useState<Record<string, string>>({});
  const group =
    grouped.find((entry) => entry.kind === activeKind) ?? grouped[0];
  const artifact =
    group?.attempts.find((entry) => entry.id === attempts[group.kind]) ??
    group?.attempts[0] ??
    null;
  const { content, loading, error, retry } = useSyncArtefactSummary(
    artifact,
    endpoint,
  );
  const label = artifact
    ? (syncArtefactLabels[artifact.kind] ?? artifact.kind.replaceAll("_", " "))
    : "Artefact";
  const parsed =
    content !== undefined && artifact?.mediaType === "application/json"
      ? parseSyncArtefactSummary(content)
      : null;

  if (!group || !artifact)
    return (
      <p className="text-sm text-muted-foreground">
        This attempt stored no artefacts.
      </p>
    );

  return (
    <Tabs
      orientation="vertical"
      value={group.kind}
      onValueChange={setActiveKind}
      className="min-w-0 flex-col gap-4 md:min-h-0 md:flex-1 md:flex-row"
    >
      <div className="shrink-0 md:min-h-0 md:w-52 md:overflow-y-auto md:pr-2">
        <div className="md:hidden">
          <OptionPicker
            value={group.kind}
            onValueChange={setActiveKind}
            aria-label="Choose artefact"
            className="w-full"
            items={grouped.map((entry) => ({
              value: entry.kind,
              label:
                syncArtefactLabels[entry.kind] ??
                entry.kind.replaceAll("_", " "),
            }))}
          />
        </div>
        <TabsList
          aria-label="Sync artefacts"
          className={`${navigationStyles.list} hidden h-auto w-full items-stretch gap-1 bg-transparent p-0 md:flex`}
        >
          {grouped.map((entry) => {
            const description = syncArtefactDescriptions[entry.kind];
            const trigger = (
              <TabsTrigger
                key={entry.kind}
                value={entry.kind}
                className="min-h-9 w-full shrink-0 justify-between gap-2 rounded-md px-3 text-left text-sm"
              >
                {syncArtefactLabels[entry.kind] ??
                  entry.kind.replaceAll("_", " ")}
                {description ? (
                  <CircleQuestionMark
                    aria-hidden="true"
                    size={14}
                    className="shrink-0 text-muted-foreground"
                  />
                ) : null}
              </TabsTrigger>
            );
            // The tab itself carries the explanation, so the mark beside the
            // name stays a mark rather than a second control to reach.
            return description ? (
              <Hint
                align="start"
                key={entry.kind}
                label={description}
                side="right"
              >
                {trigger}
              </Hint>
            ) : (
              trigger
            );
          })}
        </TabsList>
      </div>
      <TabsContent
        value={group.kind}
        className="mt-0 flex min-h-0 min-w-0 flex-1 flex-col"
      >
        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
          {group.attempts.length > 1 && (
            <div className="shrink-0 border-b border-border p-3">
              <OptionPicker
                value={artifact.id}
                onValueChange={(id) =>
                  setAttempts((current) => ({ ...current, [group.kind]: id }))
                }
                aria-label={`Choose ${label} attempt`}
                className="w-44"
                items={group.attempts.map((entry, index) => ({
                  value: entry.id,
                  label: `Attempt ${entry.attemptNumber}${index === 0 ? " (latest)" : ""}`,
                }))}
              />
            </div>
          )}
          <ArtefactViewport label={`${label} content`}>
            {error ? (
              <div className="space-y-3 p-4">
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
                <Button type="button" variant="outline" onClick={retry}>
                  Retry loading
                </Button>
              </div>
            ) : loading ? (
              <div
                role="status"
                className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground"
              >
                <LoaderCircle
                  size={17}
                  aria-hidden="true"
                  className="animate-spin motion-reduce:animate-none"
                />
                Loading artefact...
              </div>
            ) : parsed !== null ? (
              <JsonCode
                label={`${label} JSON`}
                value={parsed}
                uncapped
                borderTop={false}
              />
            ) : (
              <SourceCode
                content={content ?? ""}
                kind={artifact.kind}
                label={`${label} content`}
              />
            )}
          </ArtefactViewport>
        </section>
      </TabsContent>
    </Tabs>
  );
}
