import { readAssistantHistory } from "./history";
import type { AssistantDraft } from "./history";

const empty: AssistantDraft[] = [];

export function createAssistantDraftStore(key: string) {
  let snapshot = empty;
  let loaded = false;
  const listeners = new Set<() => void>();
  function loadStoredSnapshot() {
    if (loaded) return;
    try {
      snapshot = readAssistantHistory(localStorage.getItem(key));
    } catch {
      snapshot = empty;
    }
    loaded = true;
  }
  function notify() {
    listeners.forEach((listener) => listener());
  }
  return {
    // Keep the first browser snapshot equal to the server snapshot. Storage is
    // read when React subscribes after hydration, then React's subscription
    // check applies the restored drafts without changing the server markup.
    getSnapshot: () => snapshot,
    getServerSnapshot: () => empty,
    subscribe(listener: () => void) {
      listeners.add(listener);
      loadStoredSnapshot();
      function onStorage(event: StorageEvent) {
        if (event.key === key || event.key === null) {
          loaded = false;
          loadStoredSnapshot();
          notify();
        }
      }
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", onStorage);
      };
    },
    update(change: (previous: AssistantDraft[]) => AssistantDraft[]) {
      loadStoredSnapshot();
      snapshot = change(snapshot);
      try {
        localStorage.setItem(key, JSON.stringify(snapshot));
      } catch {
        /* Keep the current draft usable if browser storage is unavailable. */
      }
      notify();
    },
  };
}
