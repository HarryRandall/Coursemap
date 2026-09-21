import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  GitBranch,
  LayoutGrid,
  ListChecks,
  Search,
} from "lucide-react";

function SearchMock() {
  return (
    <div className="mt-6 space-y-2" aria-hidden="true">
      <div className="flex items-center gap-2.5 rounded-xl bg-white px-3.5 py-2.5 shadow-xs ring-1 ring-sky-200/70">
        <Search className="size-4 text-sky-500" />
        <span className="text-[13px] text-zinc-400">machine learning…</span>
      </div>
      {[
        ["COMP3670", "Introduction to Machine Learning", "Sem 1 · Sem 2"],
        ["COMP4670", "Statistical Machine Learning", "Sem 1"],
      ].map(([code, name, sessions]) => (
        <div
          key={code}
          className="flex items-center gap-3 rounded-xl bg-white/80 px-3.5 py-2.5 ring-1 ring-sky-100"
        >
          <span className="font-mono text-xs font-bold text-sky-700">
            {code}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-zinc-600">
            {name}
          </span>
          <span className="hidden text-[10px] font-semibold text-zinc-400 sm:block">
            {sessions}
          </span>
        </div>
      ))}
    </div>
  );
}

function ChainMock() {
  return (
    <div className="mt-6 space-y-1.5" aria-hidden="true">
      {[
        ["COMP1100", "Completed", "bg-emerald-400"],
        ["COMP1110", "Completed", "bg-emerald-400"],
        ["COMP2100", "Ready to plan", "bg-brand-400"],
      ].map(([code, status, dot], index) => (
        <div key={code} className="flex items-center gap-2">
          {index > 0 && (
            <span className="ml-4 h-3 w-px -translate-y-2 bg-brand-200" />
          )}
          <div className="flex flex-1 items-center gap-2.5 rounded-xl bg-white/85 px-3.5 py-2 ring-1 ring-brand-100">
            <span className={`size-2 rounded-full ${dot}`} />
            <span className="font-mono text-xs font-bold text-zinc-800">
              {code}
            </span>
            <span className="ml-auto text-[10px] font-semibold text-zinc-500">
              {status}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function BoardMock() {
  return (
    <div className="mt-6 grid grid-cols-2 gap-2" aria-hidden="true">
      {[
        ["Sem 1", ["COMP2100", "MATH2222"]],
        ["Sem 2", ["COMP2120", "COMP2420"]],
      ].map(([term, codes]) => (
        <div
          key={term as string}
          className="rounded-xl bg-white/85 p-2.5 ring-1 ring-amber-200/70"
        >
          <p className="text-[10px] font-bold tracking-wide text-amber-700 uppercase">
            {term}
          </p>
          <div className="mt-1.5 space-y-1.5">
            {(codes as string[]).map((code) => (
              <div
                key={code}
                className="rounded-lg bg-amber-50 px-2 py-1.5 font-mono text-[10px] font-bold text-zinc-700 ring-1 ring-amber-100"
              >
                {code}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ProgressMock() {
  return (
    <div className="mt-6 space-y-3" aria-hidden="true">
      {[
        ["Computer science major", 75],
        ["Electives", 50],
      ].map(([label, percent]) => (
        <div key={label as string}>
          <div className="flex justify-between text-[10px] font-semibold text-zinc-500">
            <span>{label}</span>
            <span>{percent}%</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-white/80 ring-1 ring-emerald-100">
            <div
              className="h-full rounded-full bg-emerald-400"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function CalendarMock() {
  return (
    <div className="mt-6 space-y-1.5" aria-hidden="true">
      {[
        ["Feb", "Semester 1 begins"],
        ["Mar", "Last day to add courses"],
      ].map(([month, event]) => (
        <div
          key={event}
          className="flex items-center gap-2.5 rounded-xl bg-white/85 px-3 py-2 ring-1 ring-rose-100"
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-rose-100 text-[10px] font-bold text-rose-700 uppercase">
            {month}
          </span>
          <span className="truncate text-xs text-zinc-600">{event}</span>
        </div>
      ))}
    </div>
  );
}

const cards = [
  {
    icon: Search,
    iconClasses: "bg-sky-500/90 text-white",
    title: "Search the whole catalogue",
    href: "/courses",
    description:
      "Course pages, offerings and sessions stay tied to a catalogue year you can trust.",
    surface: "bg-sky-100/70 ring-sky-200/60 lg:col-span-2",
    mock: SearchMock,
  },
  {
    icon: GitBranch,
    iconClasses: "bg-brand-600 text-white",
    title: "Follow prerequisite chains",
    href: "/courses/2026/comp2100",
    description:
      "See what each course needs and what it unlocks, in a graph and in plain words.",
    surface: "bg-brand-100/70 ring-brand-200/60",
    mock: ChainMock,
  },
  {
    icon: LayoutGrid,
    iconClasses: "bg-amber-500 text-white",
    title: "Plan semester by semester",
    href: "/plan",
    description:
      "Drag courses across future semesters and keep the load realistic.",
    surface: "bg-amber-100/70 ring-amber-200/60",
    mock: BoardMock,
  },
  {
    icon: ListChecks,
    iconClasses: "bg-emerald-500 text-white",
    title: "Watch requirements fill",
    href: "/requirements",
    description:
      "Units, majors and rule groups update as your plan takes shape.",
    surface: "bg-emerald-100/70 ring-emerald-200/60",
    mock: ProgressMock,
  },
  {
    icon: CalendarDays,
    iconClasses: "bg-rose-500 text-white",
    title: "Keep key dates close",
    href: "/calendar",
    description:
      "Study periods and census dates sit beside the plan they affect.",
    surface: "bg-rose-100/70 ring-rose-200/60",
    mock: CalendarMock,
  },
] as const;

export function LandingBento() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
      <div className="max-w-2xl">
        <p className="text-xs font-bold tracking-wider text-brand-700 uppercase">
          One place to plan
        </p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight text-zinc-950 sm:text-5xl">
          Everything you need to plan with confidence.
        </h2>
        <p className="mt-4 text-base leading-relaxed text-zinc-600 sm:text-lg">
          Coursemap keeps the catalogue, the rules and your plan in one
          colourful, connected workspace.
        </p>
      </div>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(
          ({
            icon: Icon,
            iconClasses,
            title,
            href,
            description,
            surface,
            mock: Mock,
          }) => (
            <article
              key={title}
              className={`group relative flex flex-col rounded-[1.75rem] p-6 ring-1 transition-shadow duration-200 focus-within:ring-2 focus-within:ring-brand-400 hover:shadow-md sm:p-7 ${surface}`}
            >
              <span
                className={`grid size-10 place-items-center rounded-xl shadow-sm ${iconClasses}`}
              >
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-lg font-bold tracking-tight text-zinc-950">
                <Link
                  href={href}
                  className="after:absolute after:inset-0 after:rounded-[1.75rem] focus-visible:outline-none"
                >
                  <span className="flex items-center gap-1">
                    {title}
                    <ArrowUpRight
                      className="size-4 text-zinc-500 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100"
                      aria-hidden="true"
                    />
                  </span>
                </Link>
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">
                {description}
              </p>
              <div className="mt-auto">
                <Mock />
              </div>
            </article>
          ),
        )}
      </div>
    </section>
  );
}
