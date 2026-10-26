import { expect, test, vi } from "vitest";

vi.mock("@/lib/rooms/campus-map-data", () => ({
  loadCampusMapData: vi.fn(async () => ({
    error: null,
    data: {
      places: [
        {
          slug: "hancock-library",
          name: "Hancock Library",
          markerLabel: "Hancock",
          address: "43 Linnaeus Way",
          searchTerms: ["library"],
          isRoutable: true,
        },
        {
          slug: "csit",
          name: "Computer Science and Information Technology",
          markerLabel: "108",
          address: "108 North Road",
          searchTerms: [],
          isRoutable: true,
        },
        {
          slug: "hancock-annex",
          name: "Old Hancock Annex",
          markerLabel: "Annex",
          address: "",
          searchTerms: [],
          isRoutable: false,
        },
      ],
    },
  })),
}));
vi.mock("@/lib/societies-data", () => ({
  loadSocieties: vi.fn(async () => ({
    events: [],
    societies: [
      {
        slug: "robotics",
        name: "ANU Robotics Club",
        shortName: "Robotics",
        category: "Academic",
        summary: "Build robots together.",
        overview: "",
        interests: ["engineering"],
      },
      {
        slug: "debating",
        name: "ANU Debating Society",
        shortName: "Debating",
        category: "Hobbies and interests",
        summary: "Weekly debates.",
        overview: "",
        interests: ["public speaking"],
      },
    ],
  })),
}));
import {
  readAssistantVisual,
  readCourseReference,
} from "@/lib/assistant/attachments";
import { readAssistantHistory } from "@/lib/assistant/history";
import { planVisuals } from "@/lib/assistant/plan-visuals";
import { assistantTools } from "@/lib/assistant/tools";

test("accepts a meter and keeps its values on the scale", () => {
  expect(
    readAssistantVisual({
      kind: "meter",
      title: "GPA against the COMP3500 requirement",
      value: 5.2,
      max: 7,
      target: 9,
      unit: "GPA",
    }),
  ).toEqual({
    kind: "meter",
    title: "GPA against the COMP3500 requirement",
    value: 5.2,
    max: 7,
    target: 7,
    unit: "GPA",
  });
  expect(
    readAssistantVisual({ kind: "meter", title: "GPA", value: 5 }),
  ).toBeNull();
  expect(
    readAssistantVisual({ kind: "pie", title: "Units", value: 1, max: 2 }),
  ).toBeNull();
});

test("keeps valid bars and drops malformed ones", () => {
  expect(
    readAssistantVisual({
      kind: "bars",
      title: "Units per requirement",
      unit: "units",
      items: [
        { label: "Major", value: 24, target: 48 },
        { label: "Electives", value: -6 },
        { value: 6 },
      ],
    }),
  ).toEqual({
    kind: "bars",
    title: "Units per requirement",
    unit: "units",
    items: [{ label: "Major", value: 24, target: 48 }],
  });
  expect(
    readAssistantVisual({ kind: "bars", title: "Empty", items: [] }),
  ).toBeNull();
});

test("restores course cards and charts saved with a reply", () => {
  const [chat] = readAssistantHistory(
    JSON.stringify([
      {
        id: "chat",
        draft: "",
        model: "",
        updatedAt: "2026-10-26T00:00:00.000Z",
        messages: [
          {
            id: "reply",
            role: "assistant",
            text: "Take COMP3500.",
            courses: [
              {
                code: "COMP3500",
                name: "Software Engineering Project",
                year: 2026,
                units: 6,
                sessions: ["First Semester"],
                prerequisites: null,
              },
              { code: "bad" },
            ],
            visuals: [{ kind: "meter", title: "GPA", value: 5, max: 7 }],
          },
        ],
      },
    ]),
  );
  expect(chat.messages[0].courses).toHaveLength(1);
  expect(chat.messages[0].visuals).toEqual([
    { kind: "meter", title: "GPA", value: 5, max: 7 },
  ]);
  expect(
    readCourseReference({ code: "COMP3500", name: "", year: 2026, units: 6 }),
  ).toBeNull();
});

test("draws a requested chart and rejects an incomplete one", async () => {
  const onVisual = vi.fn();
  const tool = assistantTools(
    { id: "student", email: null },
    { onCourse: vi.fn(), onVisual, onSociety: vi.fn(), onPlace: vi.fn() },
  ).find((item) => item.definition.function.name === "show_visual")!;
  await expect(
    tool.run({ kind: "meter", title: "GPA", value: 5, max: 7, target: 6 }),
  ).resolves.toEqual({ shown: true });
  expect(onVisual).toHaveBeenCalledWith({
    kind: "meter",
    title: "GPA",
    value: 5,
    max: 7,
    target: 6,
  });
  await expect(tool.run({ kind: "bars", title: "Units" })).rejects.toThrow(
    "That chart is incomplete.",
  );
});

test("charts requirement progress and an unmet GPA rule from the plan", () => {
  const visuals = planVisuals({
    gpa: 5.2,
    requirements: [
      {
        title: "COMP courses",
        targetUnits: 24,
        completedUnits: 6,
        plannedUnits: 6,
      },
      {
        title: "Transdisciplinary",
        targetUnits: null,
        completedUnits: 0,
        plannedUnits: 0,
      },
    ],
    terms: [
      {
        courses: [
          { code: "COMP2120" },
          {
            code: "COMP3500",
            issues: ["hard: Requires a GPA of at least 6.0 in the programme."],
          },
        ],
      },
    ],
  });
  expect(visuals).toEqual([
    {
      kind: "meter",
      title: "Your GPA against the COMP3500 requirement",
      value: 5.2,
      max: 7,
      target: 6,
      unit: "GPA",
    },
    {
      kind: "bars",
      title: "Units placed per requirement",
      unit: "units",
      items: [{ label: "COMP courses", value: 6, planned: 6, target: 24 }],
    },
  ]);
  expect(planVisuals({ gpa: null, requirements: [], terms: [] })).toEqual([]);
});

function toolNamed(
  name: string,
  callbacks: Partial<Parameters<typeof assistantTools>[1]>,
) {
  return assistantTools(
    { id: "student", email: null },
    {
      onCourse: vi.fn(),
      onVisual: vi.fn(),
      onSociety: vi.fn(),
      onPlace: vi.fn(),
      ...callbacks,
    },
  ).find((item) => item.definition.function.name === name)!;
}

test("finds a building and offers directions from a named start", async () => {
  const onPlace = vi.fn();
  const result = await toolNamed("find_place", { onPlace }).run({
    place: "hancock",
    from: "CSIT",
  });
  expect(result).toMatchObject({
    found: 2,
    directionsFrom: "Computer Science and Information Technology",
  });
  expect(onPlace).toHaveBeenNthCalledWith(1, {
    slug: "hancock-library",
    name: "Hancock Library",
    address: "43 Linnaeus Way",
    from: {
      slug: "csit",
      name: "Computer Science and Information Technology",
    },
  });
  // Only the best match carries the route.
  expect(onPlace.mock.calls[1][0]).not.toHaveProperty("from");
});

test("finds societies by interest and shows them as cards", async () => {
  const onSociety = vi.fn();
  const result = await toolNamed("find_society", { onSociety }).run({
    query: "robots",
  });
  expect(result).toMatchObject({ found: 1 });
  expect(onSociety).toHaveBeenCalledWith(
    expect.objectContaining({ slug: "robotics", name: "ANU Robotics Club" }),
  );
});
