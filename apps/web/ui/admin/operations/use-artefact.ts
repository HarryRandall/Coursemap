"use client";

import { useEffect, useState } from "react";
import type { SyncArtefactSummary } from "./artefact-data";

type Result = { key: string; content?: string; error?: string };

export function useSyncArtefactSummary(
  artifact: SyncArtefactSummary | null,
  endpoint: string,
) {
  const [result, setResult] = useState<Result | null>(null);
  const [attempt, setAttempt] = useState(0);
  const url = artifact ? `${endpoint}/${artifact.id}` : null;
  const key = `${url}:${attempt}`;

  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    void fetch(url, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const content = await response.text();
        if (!response.ok) {
          let message = "The sync artefact could not be loaded.";
          try {
            const body = JSON.parse(content) as { error?: unknown };
            if (typeof body.error === "string") message = body.error;
          } catch {
            /* Non-JSON failures use the generic message. */
          }
          throw new Error(message);
        }
        if (!controller.signal.aborted) setResult({ key, content });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setResult({
            key,
            error:
              error instanceof Error
                ? error.message
                : "The sync artefact could not be loaded.",
          });
      });
    // Switching artefacts must never display a late response for the old selection.
    return () => controller.abort();
  }, [key, url]);

  const current = result?.key === key ? result : null;
  return {
    content: current?.content,
    error: current?.error,
    loading: Boolean(artifact && !current),
    retry: () => setAttempt((value) => value + 1),
  };
}
