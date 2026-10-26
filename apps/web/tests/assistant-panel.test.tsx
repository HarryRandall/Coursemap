import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TooltipProvider } from "@coursemap/ui/primitives/tooltip";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { loadAssistantModels } from "@/lib/assistant/model-actions";
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
  replyWith([{ type: "text", delta: "Happy to help." }, { type: "done" }]);
});

/**
 * Answers the next chat requests with a stream the test controls. Lines are
 * written when `flush` is called, so a test can observe the pending state.
 */
function replyWith(events: object[], { hold = false } = {}) {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const fetchMock = vi.fn(async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        if (hold) await held;
        for (const event of events)
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        controller.close();
      },
    });
    return new Response(body, { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, flush: release };
}

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

test("restores a previous chat from the chat switcher", async () => {
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
  expect(await screen.findByText("Happy to help.")).toBeVisible();
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

test("closes the dock rather than reopening the Compass page beneath it", async () => {
  navigation.pathname = "/compass/new";
  const user = userEvent.setup();
  render(
    <AssistantProvider owner="test">
      <ExpansionHarness />
    </AssistantProvider>,
  );
  await user.click(screen.getByRole("button", { name: "Open Compass" }));
  await user.click(screen.getByRole("button", { name: "Expand assistant" }));
  expect(push).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("complementary", { name: "Compass" }),
  ).not.toBeInTheDocument();
});

test("streams a reply with the screen context and restores the conversation", async () => {
  const user = userEvent.setup();
  document.body.insertAdjacentHTML(
    "beforeend",
    '<main data-slot="sidebar-inset"><h1>COMP2120 Software Engineering</h1></main>',
  );
  const { fetchMock, flush } = replyWith(
    [
      { type: "text", delta: "Let me check. " },
      { type: "aside" },
      { type: "tool", id: "call_1", label: "Reading your plan", done: false },
      { type: "tool", id: "call_1", label: "Reading your plan", done: true },
      { type: "text", delta: "COMP2120 fits in S2." },
      { type: "done" },
    ],
    { hold: true },
  );
  const { unmount } = render(
    <AssistantProvider owner="test">
      <AssistantPanel open onClose={vi.fn()} />
    </AssistantProvider>,
  );
  expect(
    screen.queryByRole("button", { name: "Add attachments and tools" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Microphone" })).toBeNull();
  expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
  await user.type(screen.getByRole("textbox"), "Can I take this?");
  await user.click(screen.getByRole("button", { name: "Send message" }));
  expect(screen.getByRole("log")).toHaveTextContent("Can I take this?");
  expect(screen.getByRole("log")).toHaveAttribute("aria-busy", "true");
  expect(screen.getByText("Thinking...")).toBeVisible();
  expect(screen.getByRole("button", { name: "Stop reply" })).toBeVisible();
  expect(screen.getByRole("textbox")).toHaveValue("");

  const [url, init] = fetchMock.mock.calls[0] as unknown as [
    string,
    RequestInit,
  ];
  expect(url).toBe("/api/assistant/chat");
  const body = JSON.parse(String(init.body));
  expect(body.messages).toEqual([{ role: "user", text: "Can I take this?" }]);
  expect(body.screen.text).toContain("COMP2120 Software Engineering");

  flush();
  await waitFor(() =>
    expect(screen.getByRole("log")).toHaveAttribute("aria-busy", "false"),
  );
  await waitFor(() =>
    expect(screen.getByRole("log")).toHaveTextContent("COMP2120 fits in S2."),
  );
  expect(screen.getByRole("log")).not.toHaveTextContent("Let me check.");
  // The lookup folds into one line once the answer is written.
  expect(screen.getByText("Reading your plan")).toBeVisible();
  expect(screen.queryByText(/Thinking/)).toBeNull();
  expect(screen.getByRole("link", { name: "COMP2120" })).toHaveAttribute(
    "href",
    "/courses?q=COMP2120",
  );
  expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
  unmount();
  document.querySelector("main")?.remove();
  render(
    <AssistantProvider owner="test">
      <AssistantPanel open onClose={vi.fn()} />
    </AssistantProvider>,
  );
  expect(await screen.findByRole("log")).toHaveTextContent(
    "COMP2120 fits in S2.",
  );
});

test("shows looked-up courses as cards and draws requested charts", async () => {
  const user = userEvent.setup();
  replyWith([
    {
      type: "course",
      course: {
        code: "COMP3500",
        name: "Software Engineering Project",
        year: 2026,
        units: 6,
        sessions: ["First Semester"],
        prerequisites: "A GPA of 6.0 or higher",
      },
    },
    {
      type: "visual",
      visual: { kind: "meter", title: "Your GPA", value: 5, max: 7, target: 6 },
    },
    {
      type: "text",
      delta:
        "You would need COMP3500 later, but your GPA is below the requirement.",
    },
    { type: "done" },
  ]);
  const view = () => (
    <AssistantProvider owner="test">
      <AssistantPanel open onClose={vi.fn()} />
    </AssistantProvider>
  );
  const { unmount } = render(view());
  await user.type(screen.getByRole("textbox"), "Can I do the capstone?{Enter}");
  const chip = await screen.findByRole("button", {
    name: "COMP3500 Software Engineering Project",
  });
  expect(screen.getByRole("figure", { name: "Your GPA" })).toHaveTextContent(
    "1 below 6",
  );
  await user.click(chip);
  expect(screen.getByText("A GPA of 6.0 or higher")).toBeVisible();
  expect(screen.getByRole("link", { name: "Open course" })).toHaveAttribute(
    "href",
    "/courses/2026/comp3500",
  );
  unmount();
  render(view());
  expect(
    await screen.findByRole("button", {
      name: "COMP3500 Software Engineering Project",
    }),
  ).toBeVisible();
  expect(screen.getByRole("figure", { name: "Your GPA" })).toBeVisible();
});

test("keeps the question and explains a refused request", async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error:
              "You have used today's 40 Compass messages. Try again tomorrow.",
          }),
          { status: 429 },
        ),
    ),
  );
  render(
    <AssistantProvider owner="test">
      <AssistantPanel open onClose={vi.fn()} />
    </AssistantProvider>,
  );
  await user.type(screen.getByRole("textbox"), "Plan my degree{Enter}");
  expect(
    await screen.findByText(/used today's 40 Compass messages/),
  ).toBeVisible();
  expect(screen.getByRole("log")).toHaveTextContent("Plan my degree");
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
