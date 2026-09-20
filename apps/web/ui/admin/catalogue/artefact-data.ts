export type ImportArtefact = {
  id: string;
  kind: string;
  attemptNumber: number;
  mediaType: string;
};

export const importArtefactLabels: Record<string, string> = {
  raw_html: "Raw HTML",
  normalised_markdown: "Markdown",
  model_input: "Model input",
  deterministic_output: "Deterministic output",
  model_request: "Model request",
  model_response: "Model response",
  validated_json: "Validated JSON",
  validation_report: "Validation",
  change_set: "Persistence decision",
};

export function groupImportArtefacts(artifacts: ImportArtefact[]) {
  const order = Object.keys(importArtefactLabels);
  const groups = new Map<string, ImportArtefact[]>();
  // Projections live in Database rows, with the persisted records they describe.
  for (const artifact of artifacts.filter(
    (entry) => entry.kind !== "database_projection",
  )) {
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

export function parseImportArtefact(content: string): unknown {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    return null;
  }
}
