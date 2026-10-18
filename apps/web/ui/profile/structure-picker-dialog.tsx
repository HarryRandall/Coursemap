"use client";
import { useState } from "react";
import { Check, Search, TriangleAlert } from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@coursemap/ui/primitives/dialog";
import { Input } from "@coursemap/ui/primitives/input";
import { useReturnFocus } from "@/hooks/use-return-focus";
import { cn } from "@/lib/cn";
import type { ProgrammeOption } from "@/lib/coursemap/onboarding-catalogue";
import {
  DEGREE_FILTERS,
  isOneYearProgramme,
  matchesDegreeFilter,
  programmeOptionMeta,
  type DegreeFilter,
} from "@/lib/coursemap/programme-options";

export type StructurePickerKind =
  "degree" | "major" | "minor" | "specialisation";

const COPY: Record<StructurePickerKind, { title: string; search: string }> = {
  degree: { title: "Change degree", search: "Search degrees" },
  major: { title: "Choose a major", search: "Search majors" },
  minor: { title: "Choose minors", search: "Search minors" },
  specialisation: {
    title: "Choose specialisations",
    search: "Search specialisations",
  },
};

/**
 * One searchable list for every academic structure a student picks: the
 * degree, then its majors, minors and specialisations. A single choice is
 * made by clicking it, and asks first only when it would clear something
 * already chosen (`clears`). Several are ticked and confirmed together.
 */
export function StructurePickerDialog({
  kind,
  options,
  selected,
  multiple = false,
  clears = [],
  onChange,
  onClose,
}: {
  kind: StructurePickerKind;
  options: ProgrammeOption[];
  selected: readonly string[];
  multiple?: boolean;
  /** What a different single choice would clear, named for the warning. */
  clears?: readonly string[];
  onChange: (codes: string[]) => void;
  onClose: () => void;
}) {
  const returnFocus = useReturnFocus();
  const copy = COPY[kind];
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<readonly string[]>(selected);
  const [pending, setPending] = useState<ProgrammeOption | null>(null);
  const [filter, setFilter] = useState<DegreeFilter | null>(() =>
    kind === "degree" &&
    options.some(
      (option) => isOneYearProgramme(option) && selected.includes(option.code),
    )
      ? "one-year"
      : null,
  );
  const filters =
    kind === "degree"
      ? DEGREE_FILTERS.filter((item) =>
          options.some((option) => matchesDegreeFilter(option, item.value)),
        )
      : [];
  const terms = query.trim().toLowerCase().split(/\s+/u).filter(Boolean);
  const matches = options.filter(
    (option) =>
      (kind !== "degree" || matchesDegreeFilter(option, filter)) &&
      terms.every((term) =>
        `${option.name} ${option.code}`.toLowerCase().includes(term),
      ),
  );
  // Before a search the current choice leads, so it is never hunted for.
  const current =
    !multiple && !terms.length
      ? matches.filter((option) => selected.includes(option.code))
      : [];
  const rest = matches.filter((option) => !current.includes(option));
  const chosen = multiple ? draft : selected;

  const pick = (option: ProgrammeOption) => {
    if (multiple) {
      setDraft(
        draft.includes(option.code)
          ? draft.filter((item) => item !== option.code)
          : [...draft, option.code],
      );
      return;
    }
    if (selected.includes(option.code)) {
      onClose();
      return;
    }
    if (clears.length) {
      setPending(option);
      return;
    }
    onChange([option.code]);
    onClose();
  };

  const row = (option: ProgrammeOption) => {
    const isChosen = chosen.includes(option.code);
    const isPending = pending?.code === option.code;
    return (
      <li key={option.code}>
        <button
          type="button"
          aria-pressed={isChosen}
          onClick={() => pick(option)}
          className={cn(
            "flex w-full cursor-pointer items-center gap-3 px-5 py-2.5 text-left transition-colors outline-none hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset motion-reduce:transition-none",
            (isChosen || isPending) && "bg-primary/5",
          )}
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm text-foreground">{option.name}</span>
            <span className="block font-mono text-[11px] text-muted-foreground">
              {programmeOptionMeta(option)}
            </span>
          </span>
          {multiple ? (
            <span
              aria-hidden="true"
              className={cn(
                "grid size-4.5 shrink-0 place-items-center rounded-[5px] border",
                isChosen
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border",
              )}
            >
              {isChosen ? <Check size={12} /> : null}
            </span>
          ) : isChosen ? (
            <Check aria-hidden="true" className="size-4 text-primary" />
          ) : null}
        </button>
      </li>
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        {...returnFocus}
        className="flex h-[min(40rem,calc(100dvh-2rem))] flex-col gap-0 p-0 sm:max-w-lg"
      >
        <div className="space-y-3 border-b border-border p-5 pb-4">
          <DialogTitle className="text-base font-semibold">
            {copy.title}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Search the list and pick from it.
          </DialogDescription>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              autoFocus
              aria-label={copy.search}
              placeholder={
                kind === "degree" ? "Name or code, like BCOMP" : copy.search
              }
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="pl-9"
            />
          </div>
          {filters.length ? (
            <div
              role="group"
              aria-label="Filter degrees"
              className="flex flex-wrap gap-1.5"
            >
              {filters.map((item) => {
                const on = filter === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setFilter(on ? null : item.value)}
                    className={cn(
                      "cursor-pointer rounded-full border px-2.5 py-1 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                      on
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {current.length ? (
            <>
              <p className="px-5 pt-2 pb-1 text-[11px] font-medium text-muted-foreground">
                Current
              </p>
              <ul>{current.map(row)}</ul>
              <p className="px-5 pt-3 pb-1 text-[11px] font-medium text-muted-foreground">
                {kind === "degree" ? "Other degrees" : "Others"}
              </p>
            </>
          ) : null}
          <ul>{rest.map(row)}</ul>
          {matches.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-muted-foreground">
              {query
                ? `Nothing matches “${query}”.`
                : "Nothing to choose from."}
            </p>
          ) : null}
        </div>
        {pending ? (
          <DialogFooter
            role="alert"
            className="m-0 items-center gap-3 border-t border-amber-500/30 bg-amber-500/10 p-4 sm:justify-between"
          >
            <p className="flex items-start gap-2 text-[13px] text-amber-700 dark:text-amber-300">
              <TriangleAlert
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
              />
              Switching clears {clears.join(" and ")}.
            </p>
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setPending(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => {
                  onChange([pending.code]);
                  onClose();
                }}
              >
                Switch to {pending.code}
              </Button>
            </div>
          </DialogFooter>
        ) : multiple ? (
          <DialogFooter className="m-0 border-t border-border p-4 sm:items-center sm:justify-between">
            <p className="text-[13px] text-muted-foreground">
              {draft.length === 0 ? "None chosen" : `${draft.length} chosen`}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => {
                  onChange([...draft]);
                  onClose();
                }}
              >
                Done
              </Button>
            </div>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
