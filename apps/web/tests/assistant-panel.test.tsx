import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TooltipProvider } from "@coursemap/ui/primitives/tooltip";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { loadAssistantModels } from "@/lib/assistant/model-actions";
import { toast } from "sonner";
import { ASSISTANT_PREVIEW_RESPONSE } from "@/lib/assistant/history";
import { SidebarProvider, SidebarMenu } from "@coursemap/ui/primitives/sidebar";
import { AssistantRecentChat } from "@/ui/assistant/assistant-recent-chat";
import { assistantTitle, readAssistantHistory } from "@/lib/assistant/history";
import { createAssistantDraftStore } from "@/lib/assistant/draft-store";
import {
  AssistantProvider,
  useAssistant,
} from "@/ui/assistant/assistant-provider";
import { AssistantPanel } from "@/ui/assistant/assistant-panel";

const push = vi.hoisted(() => vi.fn());
const navigation = vi.hoisted(() => ({
  pathname: "/dashboard",
  replace: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: navigation.replace }),
  usePathname: () => navigation.pathname,
}));
beforeEach(() => {
  localStorage.clear();
  navigation.pathname = "/dashboard";
  vi.clearAllMocks();
});

vi.mock("@/lib/assistant/model-actions", () => ({
  loadAssistantModels: vi.fn(async () => ({
    defaultModel: "google/one",
    error: null,
    models: ["one", "two"].map((id) => ({
      id: `google/${id}`,
      name: `Model ${id}`,
      provider: "Google",
      enabled: true,
      visible: true,
      input_usd_per_million: null,
      output_usd_per_million: null,
      pricing_updated_at: null,
    })),
  })),
}));

vi.mock("sonner", () => ({ toast: { info: vi.fn() } }));

vi.mock("@coursemap/ui/hooks/use-mobile", () => ({ useIsMobile: () => false }));

test("restores browser drafts only after the hydration snapshot", () => {
  localStorage.setItem(
    "coursemap:compass:drafts:test",
    JSON.stringify([
      {
        id: "saved",
        draft: "Continue planning",
        model: "",
        updatedAt: "2026-09-22T00:00:00.000Z",
        messages: [],
      },
    ]),
  );
  const store = createAssistantDraftStore("coursemap:compass:drafts:test");
  expect(store.getServerSnapshot()).toEqual([]);
  expect(store.getSnapshot()).toEqual([]);
  const unsubscribe = store.subscribe(() => {});
  expect(store.getSnapshot()).toEqual([
    expect.objectContaining({ id: "saved", draft: "Continue planning" }),
  ]);
  unsubscribe();
});

test("keeps a draft when closed and reopened, and clears it for a new chat", () => {
  const close = vi.fn();
  const { rerender } = render(
    <AssistantProvider owner="test">
      <AssistantPanel open onClose={close} />
    </AssistantProvider>,
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: "What requirements do I still need to meet?",
    }),
  );
  expect(screen.getByRole("textbox")).toHaveValue(
    "What requirements do I still need to meet?",
  );
  expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Close assistant" }));
  expect(close).toHaveBeenCalledOnce();
  rerender(
    <AssistantProvider owner="test">
      <AssistantPanel open={false} onClose={close} />
    </AssistantProvider>,
  );
  rerender(
    <AssistantProvider owner="test">
      <AssistantPanel open onClose={close} />
    </AssistantProvider>,
  );
  expect(screen.getByRole("textbox")).toHaveValue(
    "What requirements do I still need to meet?",
  );
  fireEvent.click(screen.getByRole("button", { name: "New chat" }));
  expect(screen.getByRole("textbox")).toHaveValue("");
});

test("loads the shared model catalogue and allows a chat selection", async () => {
  const user = userEvent.setup();
  render(
    <TooltipProvider>
      <AssistantProvider owner="test">
        <AssistantPanel open onClose={vi.fn()} />
      </AssistantProvider>
    </TooltipProvider>,
  );
  expect(await screen.findByText("Model one")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Assistant model" }));
  await user.click(screen.getByRole("menuitem", { name: "Model two" }));
  expect(
    screen.getByRole("button", { name: "Assistant model" }),
  ).toHaveTextContent("Model two");
  expect(screen.queryByText(/Chat is not connected/)).not.toBeInTheDocument();
});

test("restores a previous chat and keeps the microphone inert", async () => {
  const user = userEvent.setup();
  render(
    <AssistantProvider owner="test">
      <AssistantPanel open onClose={vi.fn()} />
    </AssistantProvider>,
  );
  await user.type(screen.getByRole("textbox"), "Plan my semester");
  expect(screen.getByRole("button", { name: "Switch chat" })).toHaveTextContent(
    "New chat",
  );
  await user.click(screen.getByRole("button", { name: "Switch chat" }));
  expect(
    screen.queryByRole("menuitem", { name: "New chat" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("menuitem", { name: "Plan my semester" }),
  ).not.toBeInTheDocument();
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: "Send message" }));
  await user.click(screen.getByRole("button", { name: "New chat" }));
  expect(screen.getByRole("textbox")).toHaveValue("");
  await user.click(screen.getByRole("button", { name: "Switch chat" }));
  await user.click(screen.getByRole("menuitem", { name: "Plan my semester" }));
  expect(screen.getByRole("log")).toHaveTextContent("Plan my semester");
  const microphone = screen.getByRole("button", { name: "Microphone" });
  expect(microphone).toBeEnabled();
  await user.click(microphone);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("log")).toHaveTextContent("Plan my semester");
});

function ExpansionHarness() {
  const { panelOpen, setPanelOpen } = useAssistant();
  return (
    <>
      <button onClick={() => setPanelOpen(true)}>Open Compass</button>
      <AssistantPanel open={panelOpen} onClose={() => setPanelOpen(false)} />
    </>
  );
}

test("keeps the panel visible until fullscreen navigation takes over", async () => {
  const user = userEvent.setup();
  render(
    <AssistantProvider owner="test">
      <ExpansionHarness />
    </AssistantProvider>,
  );
  await user.click(screen.getByRole("button", { name: "Open Compass" }));
  await user.click(screen.getByRole("button", { name: "Expand assistant" }));
  expect(push).toHaveBeenCalledWith("/compass/new");
  expect(
    screen.getByRole("textbox", { name: "Message the assistant" }),
  ).toBeInTheDocument();
});

test("sends locally, replies with fixed text, and restores the conversation", async () => {
  const user = userEvent.setup();
  const { unmount } = render(
    <AssistantProvider owner="test">
      <AssistantPanel open onClose={vi.fn()} />
    </AssistantProvider>,
  );
  expect(
    screen.queryByText(
      "Preview with sample replies. Chats stay in this browser.",
    ),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
  await user.type(screen.getByRole("textbox"), "Hello Compass");
  await user.click(screen.getByRole("button", { name: "Microphone" }));
  expect(screen.queryByRole("log")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Send message" }));
  expect(screen.getByRole("log")).toHaveTextContent("Hello Compass");
  expect(screen.getByRole("log")).toHaveAttribute("aria-busy", "true");
  expect(screen.getByRole("log")).toHaveTextContent("Thinking...");
  expect(screen.getByRole("log")).not.toHaveTextContent(
    ASSISTANT_PREVIEW_RESPONSE.replace(/\s+/g, " "),
  );
  await waitFor(
    () => expect(screen.getByRole("log")).toHaveAttribute("aria-busy", "false"),
    { timeout: 5000 },
  );
  expect(screen.getByRole("log")).toHaveTextContent(
    ASSISTANT_PREVIEW_RESPONSE.replace(/\s+/g, " "),
  );
  expect(screen.getByRole("textbox")).toHaveValue("");
  await user.type(screen.getByRole("textbox"), "Second message{Enter}");
  expect(screen.getByRole("log")).toHaveTextContent("Second message");
  unmount();
  render(
    <AssistantProvider owner="test">
      <AssistantPanel open onClose={vi.fn()} />
    </AssistantProvider>,
  );
  expect(await screen.findByRole("log")).toHaveTextContent("Second message");
  await user.click(
    screen.getByRole("button", { name: "Add attachments and tools" }),
  );
  expect(
    screen.getByRole("menuitem", { name: "Add files or photos" }),
  ).toBeVisible();
  await user.click(screen.getByRole("menuitem", { name: "Web search" }));
  expect(toast.info).toHaveBeenCalledWith("Coming soon");
});

test("uses the chat URL for selection and gives a new draft its own route", () => {
  navigation.pathname = "/compass/new";
  const { rerender } = render(
    <AssistantProvider owner="test">
      <AssistantPanel open onClose={() => {}} />
    </AssistantProvider>,
  );
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "Plan next semester" },
  });
  const route = navigation.replace.mock.calls[0][0] as string;
  expect(route).toMatch(/^\/compass\/[0-9a-f-]{36}$/u);
  navigation.pathname = route;
  rerender(
    <AssistantProvider owner="test">
      <AssistantPanel open onClose={() => {}} />
    </AssistantProvider>,
  );
  expect(screen.getByRole("textbox")).toHaveValue("Plan next semester");
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  expect(screen.getByRole("log")).toHaveTextContent("Plan next semester");
  navigation.pathname = "/compass/new";
  rerender(
    <AssistantProvider owner="test">
      <AssistantPanel open onClose={() => {}} />
    </AssistantProvider>,
  );
  expect(screen.getByRole("textbox")).toHaveValue("");
  expect(screen.queryByRole("log")).not.toBeInTheDocument();
  navigation.pathname = route;
  rerender(
    <AssistantProvider owner="test">
      <AssistantPanel open onClose={() => {}} />
    </AssistantProvider>,
  );
  expect(screen.getByRole("log")).toHaveTextContent("Plan next semester");
});

test("retains the model catalogue when the panel is reopened", async () => {
  const view = (open: boolean) => (
    <AssistantProvider owner="test">
      <AssistantPanel open={open} onClose={() => {}} />
    </AssistantProvider>
  );
  const { rerender } = render(view(true));
  expect(await screen.findByText("Model one")).toBeVisible();
  rerender(view(false));
  rerender(view(true));
  expect(
    screen.getByRole("button", { name: "Assistant model" }),
  ).toHaveTextContent("Model one");
  expect(loadAssistantModels).toHaveBeenCalledTimes(1);
});

function RenameHarness() {
  const { active, rename } = useAssistant();
  if (!active) return null;
  return (
    <SidebarProvider>
      <SidebarMenu>
        <AssistantRecentChat
          chat={active}
          age="1m"
          active
          onSelect={() => {}}
          onDelete={() => {}}
          onRename={(title) => rename(active.id, title)}
        />
      </SidebarMenu>
    </SidebarProvider>
  );
}

test("renames a saved chat through its menu and persists the title", async () => {
  localStorage.setItem(
    "coursemap:compass:drafts:test",
    JSON.stringify([
      {
        id: "chat",
        draft: "",
        model: "",
        updatedAt: new Date().toISOString(),
        messages: [{ id: "message", role: "user", text: "Original question" }],
      },
    ]),
  );
  const user = userEvent.setup();
  render(
    <AssistantProvider owner="test">
      <TooltipProvider>
        <RenameHarness />
      </TooltipProvider>
    </AssistantProvider>,
  );
  await user.click(
    screen.getByRole("button", { name: "Options for Original question" }),
  );
  await user.click(screen.getByRole("menuitem", { name: "Rename chat" }));
  const input = screen.getByRole("textbox", { name: "Chat name" });
  await user.clear(input);
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  await user.type(input, "Semester plan");
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(
    screen.getByRole("link", { name: /Semester plan/ }),
  ).toBeInTheDocument();
  const saved = readAssistantHistory(
    localStorage.getItem("coursemap:compass:drafts:test"),
  );
  expect(assistantTitle(saved[0])).toBe("Semester plan");
  expect(saved[0].messages[0].text).toBe("Original question");
});
