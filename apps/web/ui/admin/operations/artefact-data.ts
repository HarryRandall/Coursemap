/** One stored technical input or output of a sync attempt. */
export type SyncArtefactSummary = {
  id: string;
  kind: string;
  attemptNumber: number;
  mediaType: string;
};

/**
 * What each artefact actually is. The names are the pipeline's own vocabulary,
 * which means nothing to a reader who has not written the pipeline, so every
 * tab carries the one sentence that places it in the run.
 */
export const syncArtefactDescriptions: Record<string, string> = {
  raw_html: "The ANU page exactly as it was fetched, before anything read it.",
  normalised_markdown: "That page as Markdown, which is all the model reads.",
  model_input: "The markdown and instructions assembled for the model to read.",
  model_request: "The request sent to the model, with the settings it ran on.",
  model_response: "What the model returned, before anything checked it.",
  validated_json:
    "The model's answer with anything that did not fit the schema left empty.",
  validation_report: "Every schema and domain check, and which ones failed.",
  content_projection:
    "The validated answer mapped onto this record's own fields.",
};

export const syncArtefactLabels: Record<string, string> = {
  raw_html: "Raw HTML",
  normalised_markdown: "Markdown",
  model_input: "Model input",
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
