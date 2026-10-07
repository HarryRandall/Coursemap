"use client";
import { useState } from "react";
import { Check, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@coursemap/ui/primitives/dialog";
import { Input } from "@coursemap/ui/primitives/input";
import { useReturnFocus } from "@/hooks/use-return-focus";
import { cn } from "@/lib/cn";
import type { ProgrammeOption } from "@/lib/coursemap/onboarding-catalogue";

/** Every degree published for the plan's year, searchable by name or code. */
export function DegreePickerDialog({
  degrees,
  selectedCode,
  onSelect,
  onClose,
}: {
  degrees: ProgrammeOption[];
  selectedCode: string;
  onSelect: (code: string) => void;
  onClose: () => void;
}) {
  const returnFocus = useReturnFocus();
  const [query, setQuery] = useState("");
  const terms = query.trim().toLowerCase().split(/\s+/u).filter(Boolean);
  const matches = degrees.filter((degree) =>
    terms.every((term) =>
      `${degree.name} ${degree.code}`.toLowerCase().includes(term),
    ),
  );
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        {...returnFocus}
        className="flex max-h-[min(40rem,calc(100dvh-2rem))] flex-col gap-0 p-0 sm:max-w-2xl"
      >
        <div className="space-y-3 border-b border-border p-5">
          <div>
            <DialogTitle className="text-lg font-semibold">
              Change degree
            </DialogTitle>
            <DialogDescription className="text-[13px]">
              Your major, minors and specialisations are cleared when you change
              it.
            </DialogDescription>
          </div>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              autoFocus
              aria-label="Search degrees"
              placeholder="Search degrees"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        <ul className="grid min-h-0 flex-1 gap-2 overflow-y-auto p-5 sm:grid-cols-2">
          {matches.map((degree) => {
            const chosen = degree.code === selectedCode;
            return (
              <li key={degree.code}>
                <button
                  type="button"
                  aria-pressed={chosen}
                  onClick={() => {
                    onSelect(degree.code);
                    onClose();
                  }}
                  className={cn(
                    "flex h-full w-full cursor-pointer flex-col gap-1 rounded-xl border p-3.5 text-left transition",
                    chosen
                      ? "border-primary ring-1 ring-primary"
                      : "border-border hover:border-muted-foreground/40 hover:bg-muted/40",
                  )}
                >
                  <span className="flex items-start justify-between gap-2 text-sm font-semibold text-foreground">
                    {degree.name}
                    {chosen ? (
                      <Check
                        size={14}
                        aria-label="Current degree"
                        className="mt-0.5 shrink-0 text-primary"
                      />
                    ) : null}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {degree.code}
                    {degree.durationYears
                      ? ` · ${degree.durationYears} years`
                      : ""}
                    {degree.units ? ` · ${degree.units} units` : ""}
                  </span>
                </button>
              </li>
            );
          })}
          {matches.length === 0 ? (
            <li className="text-[13px] text-muted-foreground sm:col-span-2">
              No degree matches “{query}”.
            </li>
          ) : null}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
