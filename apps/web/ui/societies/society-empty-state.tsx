import { ExternalLink } from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@coursemap/ui/primitives/empty";

export function SocietyEmptyState({
  kind,
  directoryUrl,
  size = "full",
}: {
  kind: "membership" | "reviews" | "events" | "upcoming" | "past";
  directoryUrl?: string;
  size?: "full" | "compact";
}) {
  const membership = kind === "membership";
  const events = ["events", "upcoming", "past"].includes(kind);
  const title = {
    membership: "Join the club",
    reviews: "No reviews yet",
    events: "No events listed",
    upcoming: "No upcoming events listed",
    past: "No past events listed",
  }[kind];
  return (
    <Empty
      className={`flex-1 rounded-xl bg-card px-6 ring-1 ring-border dark:ring-0 ${size === "compact" ? "min-h-64 gap-4 py-6" : "min-h-96 gap-5 py-12"}`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 240 170"
        fill="none"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={
          size === "compact" ? "h-32 w-45 shrink-0" : "h-42.5 w-60 shrink-0"
        }
      >
        <path d="M44 138h152M88 150h64M105 157h30" className="stroke-border" />
        <path
          d="M38 48h164M38 72h164"
          strokeDasharray="3 6"
          className="stroke-border"
        />
        {membership ? (
          <>
            <rect
              x="58"
              y="45"
              width="124"
              height="78"
              rx="9"
              className="fill-background stroke-primary"
            />
            <circle cx="91" cy="72" r="10" className="stroke-primary" />
            <path
              d="M76 104v-5c0-15 30-15 30 0v5M123 69h39M123 82h26M123 101h34"
              className="stroke-border"
            />
            <circle
              cx="179"
              cy="118"
              r="18"
              className="fill-background stroke-primary"
            />
            <path d="m170 118 6 6 12-12" className="stroke-primary" />
          </>
        ) : events ? (
          <>
            <rect
              x="65"
              y="38"
              width="110"
              height="90"
              rx="9"
              className="fill-background stroke-primary"
            />
            <path
              d="M65 65h110M92 30v17M148 30v17"
              className="stroke-primary"
            />
            <path
              d="M86 84h10M115 84h10M144 84h10M86 105h10M115 105h10"
              className="stroke-border"
            />
            <circle
              cx="149"
              cy="105"
              r="5"
              className="fill-primary/10 stroke-primary"
            />
          </>
        ) : (
          <>
            <path
              d="M65 35h110a9 9 0 0 1 9 9v60a9 9 0 0 1-9 9h-58l-24 16v-16H65a9 9 0 0 1-9-9V44a9 9 0 0 1 9-9Z"
              className="fill-background stroke-border"
            />
            <path
              d="m120 52 7 14 16 2-12 11 3 16-14-8-14 8 3-16-12-11 16-2Z"
              className="fill-primary/10 stroke-primary"
            />
          </>
        )}
      </svg>
      <EmptyHeader>
        <EmptyTitle className="text-xl">
          <h2>{title}</h2>
        </EmptyTitle>
        <EmptyDescription>
          {membership
            ? "Explore membership options and join through the club's directory."
            : events
              ? kind === "past"
                ? "Past club events will appear here."
                : "Check back for the next chance to get involved."
              : "Reviews from club members will appear here."}
        </EmptyDescription>
      </EmptyHeader>
      {directoryUrl ? (
        <Button asChild>
          <a href={directoryUrl} target="_blank" rel="noreferrer">
            {membership ? "Buy membership" : "View club profile"}
            <ExternalLink aria-hidden="true" />
          </a>
        </Button>
      ) : null}
    </Empty>
  );
}
