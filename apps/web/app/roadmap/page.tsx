import { AppShell } from "@/ui/shell";
import { RoadmapExplorer } from "@/ui/roadmap/roadmap-explorer";
import type { RoadmapStage } from "@/lib/roadmap";

const stages: RoadmapStage[] = [
  {
    id: "shipped",
    title: "Shipped",
    description: "Available in Coursemap now",
    status: "shipped",
    items: [
      {
        title: "Visual degree planning",
        description:
          "Build a semester-by-semester plan and move courses as it changes.",
        area: "plan",
        href: "/plan",
      },
      {
        title: "Course and prerequisite discovery",
        description: "Search courses and explore full prerequisite chains.",
        area: "courses",
        href: "/courses",
      },
      {
        title: "Student workspace",
        description:
          "Home, academic history, requirements, calendar and support pages.",
        area: "coursemap",
        href: "/dashboard",
      },
      {
        title: "Key dates",
        description:
          "Semester starts, census dates and exam periods imported from the ANU calendar.",
        area: "key-dates",
        href: "/key-dates",
      },
    ],
  },
  {
    id: "now",
    title: "Now",
    description: "The current product focus",
    status: "now",
    items: [
      {
        title: "Catalogue coverage",
        description:
          "Broaden degree, major and course data while keeping its source visible.",
        area: "courses",
      },
      {
        title: "Requirement accuracy",
        description:
          "Improve allocation detail and flag rules that still need review.",
        area: "requirements",
      },
      {
        title: "Account administration",
        description:
          "Make access and support workflows safer for the Coursemap team.",
        area: "admin",
      },
      {
        title: "Room finder preview",
        description:
          "Map more buildings indoors and make search results easier to act on.",
        area: "rooms",
      },
    ],
  },
  {
    id: "next",
    title: "Next",
    description: "Useful additions we want to explore",
    status: "planned",
    items: [
      {
        title: "Assessment calendar",
        description:
          "Bring assessments and important dates into the study calendar.",
        area: "calendar",
      },
      {
        title: "Credit and exemptions",
        description:
          "Represent recognised prior learning without overstating official status.",
        area: "academic",
      },
      {
        title: "Class times and rooms",
        description:
          "Show verified timetable data alongside planned courses, with room finder links.",
        area: "calendar",
      },
    ],
  },
  {
    id: "later",
    title: "Later",
    description: "Ideas without a committed delivery date",
    status: "planned",
    items: [
      {
        title: "Compare degree options",
        description:
          "Try another major or programme without changing your saved plan.",
        area: "plan",
      },
      {
        title: "Share and export",
        description:
          "Create a clear plan summary for advisers or your own records.",
        area: "plan",
      },
      {
        title: "Planning reminders",
        description:
          "Choose useful reminders for deadlines and unresolved plan items.",
        area: "key-dates",
      },
    ],
  },
  {
    id: "exploring",
    title: "Exploring",
    description: "Directions we are researching with students",
    status: "exploring",
    items: [
      {
        title: "Degree progress insights",
        description:
          "Surface useful milestones and choices while keeping the underlying rules clear.",
        area: "requirements",
      },
      {
        title: "Collaborative planning",
        description:
          "Make it easier to discuss a plan with an adviser or trusted supporter.",
        area: "plan",
      },
      {
        title: "Import your study record",
        description:
          "Explore a safe way to start from a student's existing academic history.",
        area: "academic",
      },
    ],
  },
  {
    id: "horizon",
    title: "Horizon",
    description: "Longer-term possibilities for Coursemap",
    status: "exploring",
    items: [
      {
        title: "Personalised pathway suggestions",
        description:
          "Offer clear options based on a student's goals, without replacing academic advice.",
        area: "plan",
      },
      {
        title: "Multi-year catalogue outlook",
        description:
          "Help plans account for changing course offerings and published catalogue versions.",
        area: "courses",
      },
      {
        title: "Mobile planning companion",
        description:
          "Keep key plan details and next steps easy to check while on campus.",
        area: "coursemap",
      },
    ],
  },
];

export default function RoadmapPage() {
  return (
    <AppShell>
      <div className="flex flex-1 flex-col py-2 sm:py-4">
        <h1 className="sr-only">Roadmap</h1>
        <RoadmapExplorer stages={stages} />
      </div>
    </AppShell>
  );
}
