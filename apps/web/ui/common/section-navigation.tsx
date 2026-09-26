import { cn } from "@/lib/cn";

export function SectionNavigation({
  sections,
  label = "On this page",
}: {
  sections: { id: string; label: string }[];
  label?: string;
}) {
  return (
    <nav
      aria-label={label}
      className="sticky top-[6.5rem] z-20 -mx-1 flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-background px-1 py-2 md:top-0"
    >
      {sections.map((section) => (
        <a
          key={section.id}
          href={`#${section.id}`}
          className={cn(
            "shrink-0 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
          )}
        >
          {section.label}
        </a>
      ))}
    </nav>
  );
}
