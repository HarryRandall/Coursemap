"use client";
import Link from "next/link";
import {
  ArrowUpRight,
  Bug,
  GitPullRequest,
  LifeBuoy,
  Map,
  MessageCircleQuestion,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@coursemap/ui/primitives/popover";

const REPOSITORY = "https://github.com/HarryRandall/Coursemap";

const links = [
  {
    href: `${REPOSITORY}/issues/new`,
    label: "Report an issue",
    detail: "Something wrong or missing",
    icon: Bug,
    external: true,
  },
  {
    href: REPOSITORY,
    label: "Contribute on GitHub",
    detail: "Code, catalogue fixes and ideas",
    icon: GitPullRequest,
    external: true,
  },
  {
    href: "/roadmap",
    label: "Product roadmap",
    detail: "What is coming next",
    icon: Map,
    external: false,
  },
  {
    href: "/help",
    label: "Help centre",
    detail: "Guides and answers",
    icon: LifeBuoy,
    external: false,
  },
] as const;

/** A corner button for reporting problems or getting involved. */
export function LandingHelp() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="fixed bottom-4 left-4 z-40 inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background/90 px-3 text-[12px] font-medium text-muted-foreground shadow-sm backdrop-blur-md transition hover:text-foreground"
        >
          <MessageCircleQuestion size={14} aria-hidden="true" />
          Help and feedback
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-72 rounded-lg p-1.5"
      >
        <p className="px-2.5 pt-1.5 pb-2 text-[12px] text-muted-foreground">
          Coursemap is built in the open. Its code is on GitHub.
        </p>
        <ul>
          {links.map(({ href, label, detail, icon: Icon, external }) => (
            <li key={label}>
              <Link
                href={href}
                {...(external
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
                className="group flex items-center gap-3 rounded-md px-2.5 py-2 transition hover:bg-muted"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-background text-muted-foreground group-hover:text-foreground">
                  <Icon size={15} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-foreground">
                    {label}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {detail}
                  </span>
                </span>
                {external ? (
                  <ArrowUpRight
                    size={13}
                    aria-label="Opens in a new tab"
                    className="text-muted-foreground"
                  />
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
