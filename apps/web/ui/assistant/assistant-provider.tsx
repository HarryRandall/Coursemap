"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  useState,
  useRef,
  useEffect,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { loadAssistantModels } from "@/lib/assistant/model-actions";
import { createAssistantDraftStore } from "@/lib/assistant/draft-store";
import { readAssistantEvents } from "@/lib/assistant/chat-events";
import type { AssistantChatRequest } from "@/lib/assistant/chat-events";
import { readAssistantScreen } from "@/lib/assistant/screen-context";
import type {
  AssistantCourseReference,
  AssistantVisual,
} from "@/lib/assistant/attachments";
import type { AssistantDraft, AssistantMessage } from "@/lib/assistant/history";

type ModelCatalogue = Awaited<ReturnType<typeof loadAssistantModels>>;

// The streamed reply lives in React state until it finishes, so browser
// storage is written once per reply rather than once per token.
export type AssistantStream = {
  id: string;
  chatId: string;
  text: string;
  steps: AssistantStreamStep[];
  courses: AssistantCourseReference[];
  visuals: AssistantVisual[];
  model?: string;
};

export type AssistantStreamStep = { id: string; label: string; done: boolean };

type StreamProgress = Pick<
  AssistantStream,
  "text" | "steps" | "courses" | "visuals" | "model"
>;

// Older turns add cost on every request without changing most answers.
const ASSISTANT_HISTORY_MESSAGES = 12;

type AssistantState = {
  streaming: AssistantStream | null;
  catalogue: ModelCatalogue | null;
  loadModels: () => void;
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  returnPath: string;
  setReturnPath: (path: string) => void;
  chats: AssistantDraft[];
  active: AssistantDraft | undefined;
  select: (id: string) => void;
  newChat: () => void;
  update: (patch: Partial<Pick<AssistantDraft, "draft" | "model">>) => void;
  send: () => void;
  /** Asks the last question again in place of its reply. */
  retry: () => void;
  stop: () => void;
  remove: (id: string) => void;
  rename: (id: string, title: string) => void;
};
const AssistantContext = createContext<AssistantState | null>(null);

export function AssistantProvider({
  children,
  owner,
}: {
  children: ReactNode;
  owner: string | null;
}) {
  const [streaming, setStreaming] = useState<AssistantStream | null>(null);
  const streamAbort = useRef<AbortController | null>(null);
  useEffect(() => () => streamAbort.current?.abort(), []);
  const [catalogue, setCatalogue] = useState<ModelCatalogue | null>(null);
  const modelRequest = useRef<Promise<void> | null>(null);
  const loadModels = useCallback(() => {
    if (modelRequest.current) return;
    modelRequest.current = loadAssistantModels()
      .then(setCatalogue)
      .catch(() => {
        modelRequest.current = null;
        setCatalogue({
          models: [],
          defaultModel: "",
          error:
            "The models could not be loaded. Reopen the assistant to retry.",
        });
      });
  }, []);
  const pathname = usePathname();
  const router = useRouter();
  const routeId =
    pathname.startsWith("/compass/") && pathname !== "/compass/usage"
      ? pathname.split("/")[2]
      : undefined;
  const [panelOpen, setPanelOpen] = useState(false);
  const [returnPath, setReturnPath] = useState("/dashboard");
  const key = `coursemap:compass:drafts:${owner ?? "guest"}`;
  const store = useMemo(() => createAssistantDraftStore(key), [key]);
  const chats = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  const [selected, setSelected] = useState<string | null | undefined>(
    undefined,
  );
  const selectedId = routeId
    ? routeId === "new"
      ? null
      : routeId
    : selected === undefined
      ? chats[0]?.id
      : selected;
  const active = chats.find((chat) => chat.id === selectedId);
  const update = useCallback(
    (patch: Partial<Pick<AssistantDraft, "draft" | "model">>) => {
      const id = selectedId ?? crypto.randomUUID();
      store.update((previous) => {
        const chat = previous.find((entry) => entry.id === id) ?? {
          id,
          draft: "",
          model: "",
          updatedAt: "",
          messages: [],
        };
        return [
          {
            ...chat,
            ...patch,
            updatedAt: chat.updatedAt || new Date().toISOString(),
          },
          ...previous.filter((entry) => entry.id !== id),
        ].slice(0, 50);
      });
      setSelected(id);
      if (routeId === "new") router.replace(`/compass/${id}`);
    },
    [selectedId, store, routeId, router],
  );
  /**
   * Sends `question` after the messages in `earlier`, which is the chat as it
   * should stand before the question: the whole chat for a new question, or
   * the chat without its last exchange for a retry, which replaces it.
   */
  function ask(
    chatId: string,
    earlier: AssistantDraft,
    question: AssistantMessage,
  ) {
    const replyId = crypto.randomUUID();
    const body: AssistantChatRequest = {
      chatId,
      model: earlier.model || undefined,
      messages: [...earlier.messages, question]
        .filter((message) => message.text.trim())
        .slice(-ASSISTANT_HISTORY_MESSAGES)
        .map(({ role, text }) => ({ role, text })),
      // The full-page workspace shows only the chat itself.
      screen: pathname.startsWith("/compass") ? null : readAssistantScreen(),
    };
    const changeChat = (change: (chat: AssistantDraft) => AssistantDraft) =>
      store.update((previous) =>
        previous.map((chat) => (chat.id === chatId ? change(chat) : chat)),
      );
    changeChat((chat) => ({
      ...chat,
      draft: chat.messages.length === earlier.messages.length ? "" : chat.draft,
      updatedAt: new Date().toISOString(),
      messages: [...earlier.messages, question],
    }));
    const controller = new AbortController();
    streamAbort.current = controller;
    setStreaming({
      id: replyId,
      chatId,
      text: "",
      steps: [],
      courses: [],
      visuals: [],
    });
    void streamReply(
      body,
      controller.signal,
      (stream) => setStreaming({ id: replyId, chatId, ...stream }),
      (title) => changeChat((chat) => (chat.title ? chat : { ...chat, title })),
    ).then(({ text, steps, courses, visuals, model }) => {
      if (streamAbort.current === controller) streamAbort.current = null;
      setStreaming(null);
      changeChat((chat) => ({
        ...chat,
        updatedAt: new Date().toISOString(),
        messages: [
          ...chat.messages,
          {
            id: replyId,
            role: "assistant",
            text,
            // Keep cards only for courses the reply names.
            courses: courses.filter((course) => text.includes(course.code)),
            visuals,
            steps: steps.map((step) => step.label),
            model,
          },
        ],
      }));
    });
  }

  return (
    <AssistantContext.Provider
      value={{
        streaming,
        catalogue,
        loadModels,
        panelOpen,
        setPanelOpen,
        returnPath,
        setReturnPath,
        chats,
        active,
        select: (id) => {
          setSelected(id);
          if (pathname.startsWith("/compass/")) router.push(`/compass/${id}`);
        },
        newChat: () => {
          setSelected(null);
          if (pathname.startsWith("/compass/")) router.push("/compass/new");
        },
        update,
        send: () => {
          if (!selectedId || streaming || !active?.draft.trim()) return;
          ask(selectedId, active, {
            id: crypto.randomUUID(),
            role: "user",
            text: active.draft.trim(),
          });
        },
        retry: () => {
          if (!selectedId || streaming || !active) return;
          const last = active.messages.at(-1);
          const question = active.messages.at(-2);
          if (last?.role !== "assistant" || question?.role !== "user") return;
          ask(
            selectedId,
            { ...active, messages: active.messages.slice(0, -2) },
            question,
          );
        },
        stop: () => streamAbort.current?.abort(),
        rename: (id, title) => {
          const name = title.trim().replace(/\s+/g, " ").slice(0, 64);
          if (!name) return;
          store.update((previous) =>
            previous.map((chat) =>
              chat.id === id ? { ...chat, title: name } : chat,
            ),
          );
        },
        remove: (id) => {
          store.update((previous) => previous.filter((chat) => chat.id !== id));
          if (selectedId === id) {
            setSelected(null);
            if (routeId) router.replace("/compass/new");
          }
        },
      }}
    >
      {children}
    </AssistantContext.Provider>
  );
}

/**
 * Streams one reply from the chat route and resolves with the reply to keep.
 * Failures resolve with a readable message rather than rejecting, so the
 * question stays in the chat with an explanation beside it.
 */
async function streamReply(
  body: AssistantChatRequest,
  signal: AbortSignal,
  onProgress: (stream: StreamProgress) => void,
  onTitle: (title: string) => void,
): Promise<StreamProgress> {
  const progress: StreamProgress = {
    text: "",
    steps: [],
    courses: [],
    visuals: [],
  };
  // Where the answer starts; narration before tool calls is cut back to it.
  let answerStart = 0;
  const reply = (text: string) => ({ ...progress, text });
  try {
    const response = await fetch("/api/assistant/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.body) throw new Error("Compass did not reply.");
    if (!response.ok) {
      const failure: unknown = await response.json().catch(() => null);
      return reply(
        typeof failure === "object" &&
          failure !== null &&
          "error" in failure &&
          typeof failure.error === "string"
          ? failure.error
          : "Compass could not answer. Try again.",
      );
    }
    for await (const event of readAssistantEvents(response.body)) {
      if (event.type === "text") {
        progress.text += event.delta;
      } else if (event.type === "title") {
        onTitle(event.title);
      } else if (event.type === "done") {
        progress.model = event.model || undefined;
      } else if (event.type === "aside") {
        progress.text = progress.text.slice(0, answerStart);
      } else if (event.type === "tool") {
        const step = { id: event.id, label: event.label, done: event.done };
        progress.steps = progress.steps.some((item) => item.id === event.id)
          ? progress.steps.map((item) => (item.id === event.id ? step : item))
          : [...progress.steps, step];
        answerStart = progress.text.length;
      } else if (event.type === "course") {
        progress.courses = [...progress.courses, event.course];
      } else if (event.type === "visual") {
        progress.visuals = [...progress.visuals, event.visual];
      } else if (event.type === "error") {
        return reply(
          progress.text
            ? `${progress.text}\n\n${event.message}`
            : event.message,
        );
      }
      onProgress({ ...progress });
    }
    return reply(progress.text || "Compass did not reply. Try asking again.");
  } catch {
    if (signal.aborted) return reply(progress.text || "Stopped.");
    return reply(
      progress.text
        ? `${progress.text}\n\nThe reply was interrupted.`
        : "Compass could not answer. Try again.",
    );
  }
}

export function useAssistant() {
  const value = useContext(AssistantContext);
  if (!value) throw new Error("The Compass provider is missing.");
  return value;
}
