"use client";

import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@coursemap/ui/primitives/dialog";
import { Command } from "cmdk";
import {
  BookOpen,
  CalendarDays,
  GraduationCap,
  ListChecks,
  LoaderCircle,
  Map,
  Search,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CourseToken } from "@/ui/common/course-token";

type SearchCourse = {
  accent: "amber" | "blue" | "cyan" | "mint" | "rose" | "violet";
  code: string;
  name: string;
  units: number;
  year: number;
};

type DefaultOption = {
  href: string;
  icon: LucideIcon;
  label: string;
  scope: string;
};

const defaultOptions: DefaultOption[] = [
  {
    href: "/courses",
    icon: BookOpen,
    label: "Explore courses",
    scope: "Catalogue",
  },
  {
    href: "/plan",
    icon: Map,
    label: "Planner",
    scope: "Planning",
  },
  {
    href: "/requirements",
    icon: ListChecks,
    label: "Requirements",
    scope: "Planning",
  },
  {
    href: "/academic",
    icon: GraduationCap,
    label: "Academic history",
    scope: "Your study",
  },
  {
    href: "/key-dates",
    icon: CalendarDays,
    label: "Key dates",
    scope: "Calendar",
  },
];

const adminDefaultOptions: DefaultOption[] = [
  {
    href: "/admin/courses",
    icon: BookOpen,
    label: "Course Catalogue",
    scope: "Academic data",
  },
  {
    href: "/admin/programmes",
    icon: GraduationCap,
    label: "Programmes",
    scope: "Academic data",
  },
  {
    href: "/admin/users",
    icon: UsersRound,
    label: "Users",
    scope: "Access",
  },
];

export function CourseFind({
  admin = false,
  onNavigate,
}: {
  admin?: boolean;
  onNavigate: () => void;
}) {
  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchCourse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showFind = useCallback(() => {
    setQuery("");
    setResults([]);
    setLoading(false);
    setError(null);
    setOpen(true);
  }, []);

  const hideFind = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const isTyping =
        target instanceof HTMLElement &&
        (target.matches("input, textarea, select") || target.isContentEditable);
      const isFindKey =
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        event.key.toLowerCase() === "f";
      const isCommandKey =
        (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";

      if (event.defaultPrevented || (isTyping && !isCommandKey)) return;
      if (!isFindKey && !isCommandKey) return;

      const trigger = triggerRef.current;
      if (!trigger || trigger.getClientRects().length === 0) return;

      event.preventDefault();
      if (open) hideFind();
      else showFind();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hideFind, open, showFind]);

  useEffect(() => {
    const text = query.trim();
    if (!open || !text) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/courses/search?q=${encodeURIComponent(text)}&pageSize=8&year=${new Date().getFullYear()}`,
          { signal: controller.signal },
        );
        const payload = (await response.json()) as {
          courses?: SearchCourse[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error ?? "Course search is unavailable.");
        }
        if (controller.signal.aborted) return;
        setResults(payload.courses ?? []);
        setError(null);
      } catch (caughtError) {
        if (!controller.signal.aborted) {
          setResults([]);
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Course search is unavailable.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 150);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [open, query]);

  const navigate = (href: string) => {
    hideFind();
    onNavigate();
    router.push(href);
  };

  const text = query.trim();
  const hasQuery = Boolean(text);
  const shortcuts = admin ? adminDefaultOptions : defaultOptions;
  // Pages stay reachable by name once typing starts, below the courses.
  const pages = hasQuery
    ? shortcuts.filter((option) =>
        `${option.label} ${option.scope}`
          .toLowerCase()
          .includes(text.toLowerCase()),
      )
    : shortcuts;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-keyshortcuts="f"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={showFind}
        className="flex h-10 w-full cursor-pointer items-center gap-2 rounded-lg bg-card px-3 text-muted-foreground shadow-xs ring-1 ring-border transition-colors ring-inset group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 hover:text-foreground hover:ring-ring/40"
      >
        <Search size={16} strokeWidth={1.8} aria-hidden="true" />
        <span className="flex-1 text-left text-[13px] group-data-[collapsible=icon]:sr-only">
          Find<span className="sr-only"> courses</span>
        </span>
        <kbd
          aria-hidden="true"
          className="grid size-6 place-items-center rounded-md border border-border bg-muted text-[11px] font-medium text-muted-foreground shadow-xs group-data-[collapsible=icon]:hidden"
        >
          F
        </kbd>
      </button>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) hideFind();
        }}
      >
        <DialogContent
          showCloseButton={false}
          aria-describedby="course-find-description"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            inputRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus();
          }}
          className="find-dialog top-[max(1rem,12dvh)] z-[120] flex w-[calc(100vw-2rem)] max-w-[36rem] translate-y-0 flex-col gap-0 overflow-hidden rounded-xl border-0 bg-popover p-0 shadow-2xl ring-1 ring-border outline-none sm:max-w-[36rem]"
        >
          <DialogTitle className="sr-only">Find courses</DialogTitle>
          <DialogDescription id="course-find-description" className="sr-only">
            Search the published course catalogue by course code or name, or
            jump to a page.
          </DialogDescription>

          <Command
            label="Find courses"
            loop
            shouldFilter={false}
            className="flex max-h-[min(30rem,calc(100dvh-max(1rem,12dvh)-1rem))] w-full min-w-0 flex-col"
          >
            <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
              {loading ? (
                <LoaderCircle
                  size={18}
                  aria-label="Searching"
                  className="shrink-0 animate-spin text-muted-foreground"
                />
              ) : (
                <Search
                  size={18}
                  strokeWidth={1.8}
                  aria-hidden="true"
                  className="shrink-0 text-muted-foreground"
                />
              )}
              <Command.Input
                ref={inputRef}
                value={query}
                onValueChange={(value) => {
                  if (value.trim() === query.trim()) {
                    setQuery(value);
                    return;
                  }
                  const hasValue = Boolean(value.trim());
                  setQuery(value);
                  setError(null);
                  setLoading(hasValue);
                  if (!hasValue) setResults([]);
                }}
                placeholder="Search courses by code or name…"
                aria-label="Find courses"
                autoComplete="off"
                spellCheck={false}
                className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
              />
              <kbd className="hidden rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline">
                Esc
              </kbd>
            </div>

            <Command.List
              label="Find results"
              className="find-command-list min-h-0 flex-1 overflow-y-auto p-2"
            >
              {hasQuery ? (
                <Command.Group heading="Courses" className={groupClassName}>
                  {loading && results.length === 0 ? (
                    <LoadingRows />
                  ) : error ? (
                    <FindMessage message={error} alert />
                  ) : results.length === 0 ? (
                    <FindMessage message={`No courses match '${text}'`} />
                  ) : (
                    results.map((course) => (
                      <Command.Item
                        key={course.code}
                        value={course.code}
                        onSelect={() =>
                          navigate(
                            `/courses/${course.year}/${course.code.toLowerCase()}`,
                          )
                        }
                        className={itemClassName}
                      >
                        <CourseToken
                          code={course.code}
                          accent={course.accent}
                          size="sm"
                          className="!size-8 !rounded-md !text-[9px]"
                        />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {course.name}
                        </span>
                        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                          {course.code}
                        </span>
                        <span className="w-14 shrink-0 text-right text-[11px] text-muted-foreground">
                          {course.units} units
                        </span>
                      </Command.Item>
                    ))
                  )}
                </Command.Group>
              ) : null}
              {pages.length > 0 ? (
                <Command.Group
                  heading={hasQuery ? "Pages" : "Go to"}
                  className={groupClassName}
                >
                  {pages.map((option) => (
                    <DefaultOptionItem
                      key={option.href}
                      option={option}
                      onSelect={() => navigate(option.href)}
                    />
                  ))}
                </Command.Group>
              ) : null}
            </Command.List>

            <div
              aria-hidden="true"
              className="hidden h-9 shrink-0 items-center gap-4 border-t border-border bg-muted/40 px-4 text-[11px] text-muted-foreground sm:flex"
            >
              <span className="flex items-center gap-1.5">
                <Key>↑</Key>
                <Key>↓</Key>
                Move
              </span>
              <span className="flex items-center gap-1.5">
                <Key>↵</Key>
                Open
              </span>
              <span className="ml-auto flex items-center gap-1.5">
                <Key>⌘</Key>
                <Key>K</Key>
                or
                <Key>F</Key>
                to search
              </span>
            </div>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}

const groupClassName =
  "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground";

const itemClassName =
  "flex h-12 cursor-pointer items-center gap-3 rounded-lg px-2 text-foreground/85 outline-none data-[selected=true]:bg-accent data-[selected=true]:text-foreground";

function Key({ children }: { children: string }) {
  return (
    <kbd className="grid h-5 min-w-5 place-items-center rounded border border-border bg-background px-1 font-sans text-[10px] font-medium">
      {children}
    </kbd>
  );
}

function DefaultOptionItem({
  option,
  onSelect,
}: {
  option: DefaultOption;
  onSelect: () => void;
}) {
  const Icon = option.icon;
  return (
    <Command.Item
      value={option.label}
      onSelect={onSelect}
      className={itemClassName}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
        <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {option.label}
      </span>
      <span className="shrink-0 text-[11px] text-muted-foreground">
        {option.scope}
      </span>
    </Command.Item>
  );
}

function LoadingRows() {
  return (
    <div role="status" aria-label="Searching courses">
      <span className="sr-only">Searching courses…</span>
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          aria-hidden="true"
          className="flex h-12 animate-pulse items-center gap-3 px-2"
        >
          <span className="size-8 rounded-md bg-muted" />
          <span className="min-w-0 flex-1 space-y-1.5">
            <span className="block h-2.5 w-3/5 rounded-full bg-muted" />
            <span className="block h-2 w-2/5 rounded-full bg-muted" />
          </span>
        </div>
      ))}
    </div>
  );
}

function FindMessage({
  message,
  alert = false,
}: {
  message: string;
  alert?: boolean;
}) {
  return (
    <p
      role={alert ? "alert" : "status"}
      className="grid h-12 place-items-center px-3 text-center text-xs text-muted-foreground"
    >
      {message}
    </p>
  );
}
