/** One stored technical input or output of a sync attempt. */
export type SyncArtefactSummary = {
  id: string;
  kind: string;
  attemptNumber: number;
  mediaType: string;
};

export const syncArtefactLabels: Record<string, string> = {
  raw_html: "Raw HTML",
  normalised_markdown: "Markdown",
  model_input: "Model input",
  deterministic_output: "Deterministic output",
  model_request: "Model request",
  model_response: "Model response",
  validated_json: "Validated JSON",
  validation_report: "Validation",
  content_projection: "Projected content",
};

export function groupSyncArtefactSummarys(artifacts: SyncArtefactSummary[]) {
  const order = Object.keys(syncArtefactLabels);
  const groups = new Map<string, SyncArtefactSummary[]>();
  for (const artifact of artifacts) {
    const group = groups.get(artifact.kind) ?? [];
    group.push(artifact);
    groups.set(artifact.kind, group);
  }
  return [...groups]
    .map(([kind, attempts]) => ({
      kind,
      attempts: attempts.sort((a, b) => b.attemptNumber - a.attemptNumber),
    }))
    .sort((a, b) => {
      const position = (kind: string) =>
        order.includes(kind) ? order.indexOf(kind) : order.length;
      return position(a.kind) - position(b.kind);
    });
}

export function parseSyncArtefactSummary(content: string): unknown {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    return null;
  }
}
