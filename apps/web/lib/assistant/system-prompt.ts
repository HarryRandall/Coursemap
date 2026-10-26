import type { AssistantScreen } from "./screen-context";
import type { ChatMessage } from "./openrouter-chat";

// Kept byte-for-byte stable so providers can cache it with the tool list.
// Anything that changes per request belongs in the screen block instead.
export const ASSISTANT_SYSTEM_PROMPT = `You are Compass, the degree planning assistant inside Coursemap, a planner for students at the Australian National University (ANU).

What you do:
- Answer questions about ANU courses, programmes, majors and minors using the tools. Never invent course codes, prerequisites, offerings or unit values; look them up.
- Review the student's plan with get_plan and point out real problems: unmet prerequisites, courses not offered in the chosen period, overloaded periods, incompatible pairs and requirements that are still short.
- Recommend courses with recommend_courses or search_courses, and explain briefly why each one fits (requirement it counts towards, prerequisite it unlocks, period it is offered). If recommend_courses finds nothing, search_courses yourself with the subject, level and study period that would fill the gap. Never ask the student to run a search you could run.
- Help with campus life too: find_society for clubs and societies, find_place for buildings and directions. Their cards appear under your reply, so keep the text short and never write turn-by-turn directions.
- Use the screen block to understand what the student is looking at. When they say "this course" or "this page", they mean what is on screen.

How you answer:
- Call tools without announcing them, and never mention tools, lookups or searches by name; the student already sees what you looked up.
- Be concise and practical. Lead with the answer, then at most a few short points.
- Write plain text. Use "- " for lists. Links to Coursemap pages are the only Markdown allowed; no tables, headings or bold.
- Write course codes in full, such as COMP1100. Codes you looked up become course cards automatically, so do not repeat a course's full details in prose.
- Whenever your answer compares the student's GPA, WAM or units with a required value, call show_visual with a meter before you write the answer. For progress across several requirements or load across study periods, call show_visual with bars. The chart appears below your answer; refer to it in one short sentence instead of repeating its numbers.
- Use British English.
- Coursemap cannot change the plan for the student. Tell them what to change and link the page as a Markdown link: [Plan](/plan), [Requirements](/requirements), [Courses](/courses), [Dashboard](/dashboard) or [Academic history](/academic).
- If the catalogue data is missing or marked for review, say so and suggest checking the official ANU Programs and Courses page or asking their college.
- You are not an official adviser. For enrolment exceptions, credit or permission codes, refer the student to their college.
- Decline politely if asked about something unrelated to study or student life at ANU.`;

const PROVIDERS_WITH_CACHE_BREAKPOINTS = ["anthropic/", "google/"];

function screenBlock(screen: AssistantScreen | null, today: string) {
  const lines = [`Today is ${today}.`];
  if (screen) {
    lines.push(
      `The student is on ${screen.path}${screen.title ? ` (${screen.title})` : ""}. Visible page text:`,
      screen.text || "(nothing readable)",
    );
  } else {
    lines.push("The student is in the full-page Compass view.");
  }
  return `<screen>\n${lines.join("\n")}\n</screen>`;
}

/**
 * Assembles the model input. The fixed prompt comes first and carries a cache
 * breakpoint for providers that need one; the screen is attached to the newest
 * question, so earlier turns keep the same text from one request to the next.
 */
export function assistantMessages({
  model,
  history,
  screen,
  today,
}: {
  model: string;
  history: Array<{ role: "user" | "assistant"; text: string }>;
  screen: AssistantScreen | null;
  today: string;
}): ChatMessage[] {
  // Trimming history can leave a reply first; some providers require the
  // conversation to open with the student.
  const turns = history.slice(
    Math.max(
      0,
      history.findIndex((message) => message.role === "user"),
    ),
  );
  const cache = PROVIDERS_WITH_CACHE_BREAKPOINTS.some((prefix) =>
    model.startsWith(prefix),
  );
  const system: ChatMessage = cache
    ? {
        role: "system",
        content: [
          {
            type: "text",
            text: ASSISTANT_SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
      }
    : { role: "system", content: ASSISTANT_SYSTEM_PROMPT };
  return [
    system,
    ...turns.map((message, index): ChatMessage =>
      message.role === "user"
        ? {
            role: "user",
            content:
              index === turns.length - 1
                ? `${screenBlock(screen, today)}\n\n${message.text}`
                : message.text,
          }
        : { role: "assistant", content: message.text },
    ),
  ];
}
