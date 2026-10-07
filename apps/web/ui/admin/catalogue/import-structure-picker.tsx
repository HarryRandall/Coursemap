"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Badge } from "@coursemap/ui/components/badge";
import { Checkbox } from "@coursemap/ui/primitives/checkbox";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@coursemap/ui/primitives/input-group";
import { cn } from "@/lib/cn";

export type ScopeStructure = {
  recordId: number;
  kind: "programme" | "major" | "minor" | "specialisation";
  code: string;
  name: string;
  courseCount: number;
};

const KINDS = [
  { value: "all", label: "All types" },
  { value: "programme", label: "Degrees" },
  { value: "major", label: "Majors" },
  { value: "minor", label: "Minors" },
  { value: "specialisation", label: "Specialisations" },
] as const;

const KIND_LABEL: Record<ScopeStructure["kind"], string> = {
  programme: "Degree",
  major: "Major",
  minor: "Minor",
  specialisation: "Specialisation",
};

/**
 * Choose degrees, majors, minors or specialisations whose courses an import
 * should cover. Selection is by record so the same code in another year is
 * never mixed in.
 */
export function ImportStructurePicker({
  structures,
  selected,
  onSelectedChange,
  max,
  disabled,
}: {
  /** Null while the list loads. */
  structures: ScopeStructure[] | null;
  selected: readonly number[];
  onSelectedChange: (recordIds: number[]) => void;
  max: number;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<(typeof KINDS)[number]["value"]>("all");
  const chosen = useMemo(
    () =>
      selected
        .map((id) => structures?.find((entry) => entry.recordId === id))
        .filter((entry): entry is ScopeStructure => Boolean(entry)),
    [selected, structures],
  );
  const visible = useMemo(() => {
    const search = query.trim().toLowerCase();
    return (structures ?? []).filter(
      (entry) =>
        (kind === "all" || entry.kind === kind) &&
        (!search ||
          entry.code.toLowerCase().includes(search) ||
          entry.name.toLowerCase().includes(search)),
    );
  }, [structures, query, kind]);
  const full = selected.length >= max;

  function toggle(recordId: number, checked: boolean) {
    onSelectedChange(
      checked
        ? [...selected, recordId]
        : selected.filter((id) => id !== recordId),
    );
  }

  return (
    <div className="space-y-3">
      {chosen.length ? (
        <ul aria-label="Chosen" className="flex flex-wrap gap-1.5">
          {chosen.map((entry) => (
            <li key={entry.recordId}>
              <Badge
                variant="primary-light"
                className="h-7 gap-1.5 pr-1 pl-2.5 text-xs"
              >
                {entry.name}
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={`Remove ${entry.name}`}
                  onClick={() => toggle(entry.recordId, false)}
                  className="grid size-5 place-items-center rounded-full hover:bg-primary/15"
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="overflow-hidden rounded-xl border border-border">
        <div className="space-y-2 border-b border-border bg-muted/30 p-2">
          <InputGroup>
            <InputGroupAddon>
              <Search aria-hidden="true" />
            </InputGroupAddon>
            <InputGroupInput
              aria-label="Search degrees and majors"
              placeholder="Search by name or code"
              value={query}
              disabled={disabled}
              onChange={(event) => setQuery(event.target.value)}
            />
          </InputGroup>
          <div role="group" aria-label="Type" className="flex flex-wrap gap-1">
            {KINDS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={kind === option.value}
                onClick={() => setKind(option.value)}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs text-muted-foreground transition hover:text-foreground",
                  kind === option.value &&
                    "bg-primary/10 font-medium text-primary hover:text-primary",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <ul
          aria-label="Degrees and majors"
          aria-busy={structures === null}
          className="max-h-64 overflow-y-auto overscroll-contain p-1"
        >
          {structures === null ? (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              Loading degrees and majors...
            </li>
          ) : visible.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              {structures.length === 0
                ? "No imported degree or major names any courses yet."
                : "Nothing matches that search."}
            </li>
          ) : (
            visible.map((entry) => {
              const checked = selected.includes(entry.recordId);
              const id = `scope-${entry.recordId}`;
              return (
                <li key={entry.recordId}>
                  <label
                    htmlFor={id}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-accent/50",
                      checked && "bg-primary/5",
                    )}
                  >
                    <Checkbox
                      id={id}
                      checked={checked}
                      disabled={disabled || (!checked && full)}
                      onCheckedChange={(value) =>
                        toggle(entry.recordId, value === true)
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">
                        {entry.name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {KIND_LABEL[entry.kind]} · {entry.code}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {entry.courseCount}{" "}
                      {entry.courseCount === 1 ? "course" : "courses"}
                    </span>
                  </label>
                </li>
              );
            })
          )}
        </ul>
      </div>
      {full ? (
        <p className="text-xs text-muted-foreground">
          Up to {max} can be combined in one import.
        </p>
      ) : null}
    </div>
  );
}
