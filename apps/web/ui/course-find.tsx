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
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
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

type FindGeometry = {
  left: number;
  top: number;
  width: number;
};

const modalWidth = 420;
const viewportGutter = 12;
const dialogHeight = 269;

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
  const [geometry, setGeometry] = useState<FindGeometry | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchCourse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const measure = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return null;

    const rect = trigger.getBoundingClientRect();
    const width = Math.min(modalWidth, window.innerWidth - viewportGutter * 2);
    const left = Math.min(
      Math.max(rect.left, viewportGutter),
      window.innerWidth - width - viewportGutter,
    );
    const nextGeometry = {
      left,
      top: Math.max(
        viewportGutter,
        Math.min(rect.top, window.innerHeight - dialogHeight - viewportGutter),
      ),
      width,
    };
    setGeometry(nextGeometry);
    return nextGeometry;
  }, []);

  const showFind = useCallback(() => {
    setQuery("");
    setResults([]);
    setLoading(false);
    setError(null);
    measure();
    setOpen(true);
  }, [measure]);

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
    if (!open) return;
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [measure, open]);

  useEffect(() => {
    const text = query.trim();
    if (!open || !text) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/courses/search?q=${encodeURIComponent(text)}&pageSize=5&year=${new Date().getFullYear()}`,
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

  const hasQuery = Boolean(query.trim());
  const shortcuts = admin ? adminDefaultOptions : defaultOptions;
  const findStyle: CSSProperties | undefined = geometry
    ? {
        top: geometry.top,
        left: geometry.left,
        width: geometry.width,
        height: dialogHeight,
        maxHeight: `calc(100dvh - ${geometry.top + viewportGutter}px)`,
      }
    : undefined;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Find courses"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={showFind}
        className="flex h-10 w-full cursor-pointer items-center gap-2 rounded-lg bg-card px-3 text-muted-foreground shadow-xs ring-1 ring-border transition-colors ring-inset group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 hover:text-foreground hover:ring-ring/40"
      >
        <Search size={16} strokeWidth={1.8} aria-hidden="true" />
        <span className="flex-1 text-left text-[13px] group-data-[collapsible=icon]:hidden">
          Find
        </span>
        <kbd className="grid size-6 place-items-center rounded-md border border-border bg-muted text-[11px] font-medium text-muted-foreground shadow-xs group-data-[collapsible=icon]:hidden">
          F
        </kbd>
      </button>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) hideFind();
        }}
      >
        {geometry && (
          <DialogContent
            showCloseButton={false}
            style={findStyle}
            aria-describedby="course-find-description"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              inputRef.current?.focus();
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              triggerRef.current?.focus();
            }}
            className="find-dialog fixed z-[120] translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-xl border-0 bg-popover p-0 shadow-lg ring-1 ring-border outline-none"
          >
            <DialogTitle className="sr-only">Find courses</DialogTitle>
            <DialogDescription id="course-find-description" className="sr-only">
              Search the published course catalogue by course code or name.
            </DialogDescription>

            <Command
              label="Find courses"
              loop
              shouldFilter={false}
              className="relative h-full min-h-0 overflow-hidden rounded-xl"
            >
              <div className="relative flex h-10 items-center gap-2 px-3">
                <Search
                  size={16}
                  strokeWidth={1.8}
                  aria-hidden="true"
                  className="shrink-0 text-muted-foreground"
                />
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
                  placeholder="Find courses…"
                  aria-label="Find courses"
                  autoComplete="off"
                  spellCheck={false}
                  className="h-10 min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
                />
                {loading && results.length > 0 && (
                  <LoaderCircle
                    size={13}
                    aria-label="Updating results"
                    className="animate-spin text-muted-foreground"
                  />
                )}
                <kbd className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground shadow-xs">
                  Esc
                </kbd>
              </div>

              <div className="h-px bg-border" />

              <Command.List
                label="Find results"
                className="find-command-list h-[calc(100%-41px)] overflow-y-auto p-1"
              >
                {!hasQuery ? (
                  shortcuts.map((option) => (
                    <DefaultOptionItem
                      key={option.href}
                      option={option}
                      onSelect={() => navigate(option.href)}
                    />
                  ))
                ) : loading && results.length === 0 ? (
                  <LoadingRows />
                ) : error ? (
                  <FindMessage message={error} alert />
                ) : results.length === 0 ? (
                  <FindMessage message={`No courses match '${query.trim()}'`} />
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
                      className="group flex h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-foreground/80 outline-none data-[selected=true]:bg-muted data-[selected=true]:text-foreground"
                    >
                      <CourseToken
                        code={course.code}
                        accent={course.accent}
                        size="sm"
                        className="!size-6 !rounded-md !text-[8px]"
                      />
                      <span className="min-w-0 flex-1 leading-tight">
                        <span className="block truncate text-xs font-medium">
                          {course.name}
                        </span>
                        <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                          {course.code} · {course.units} units
                        </span>
                      </span>
                    </Command.Item>
                  ))
                )}
              </Command.List>
            </Command>
          </DialogContent>
        )}
      </Dialog>
    </>
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
      className="flex h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-foreground/80 outline-none data-[selected=true]:bg-accent data-[selected=true]:text-foreground"
    >
      <span className="grid size-6 shrink-0 place-items-center text-muted-foreground">
        <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-xs font-medium">
          {option.label}
        </span>
        <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
          {option.scope}
        </span>
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
          className="flex h-11 animate-pulse items-center gap-2.5 px-2"
        >
          <span className="size-6 rounded-md bg-muted" />
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
      className="grid h-11 place-items-center px-3 text-center text-[11px] text-muted-foreground"
    >
      {message}
    </p>
  );
}
