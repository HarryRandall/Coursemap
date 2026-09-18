/** Reads the `data: {...}\n\n` frames emitted by streaming admin endpoints. */
export async function readImportStream(
  response: Response,
  onEvent: (event: Record<string, unknown>) => void,
) {
  if (!response.ok) {
    let message = `The request failed with HTTP ${response.status}.`;
    try {
      const body = (await response.clone().json()) as { error?: unknown };
      if (typeof body.error === "string" && body.error.trim()) {
        message = body.error.trim();
      }
    } catch {
      // Keep the status-based message for non-JSON failures.
    }
    throw new Error(message);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("The stream was empty.");

  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;

  const consumeLine = (line: string) => {
    if (!line.startsWith("data:")) return;
    const payload = line.slice(5).trim();
    if (!payload) return;
    const event = JSON.parse(payload) as Record<string, unknown>;
    if (event.type === "error") {
      throw new Error(
        typeof event.message === "string"
          ? event.message
          : "The request failed.",
      );
    }
    if (event.type === "complete") completed = true;
    onEvent(event);
  };

  for (;;) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) consumeLine(line);
    if (done) {
      if (buffer.trim()) consumeLine(buffer);
      if (!completed) throw new Error("The stream ended before completion.");
      return;
    }
  }
}
