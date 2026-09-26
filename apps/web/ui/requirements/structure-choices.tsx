"use client";
import { StructureEmptyState } from "@/ui/requirements/structure-empty-state";
import { useState } from "react";
import { ArrowRight, BookOpen, Search } from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import { Input } from "@coursemap/ui/primitives/input";
import type { ProgrammeOption } from "@/lib/coursemap/onboarding-catalogue";
import type { SelectableStructureKind } from "@/lib/coursemap/programme-structure-options";

export function StructureChoices({
  kind,
  options,
  pending,
  onSelect,
}: {
  kind: SelectableStructureKind;
  options: ProgrammeOption[];
  pending: boolean;
  onSelect: (option: ProgrammeOption) => void;
}) {
  const [query, setQuery] = useState("");
  const label =
    kind === "major" ? "major" : kind === "minor" ? "minor" : "specialisation";
  const visible = options.filter((option) =>
    `${option.name} ${option.code}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  if (!options.length)
    return <StructureEmptyState kind={kind} available={false} />;
  return (
    <section aria-label={`Choose a ${label}`} className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">Choose a {label}</h2>
        {options.length > 6 ? (
          <div className="relative w-full sm:w-64">
            <Search
              aria-hidden="true"
              className="absolute top-2.5 left-3 text-muted-foreground"
              size={16}
            />
            <Input
              className="pl-9"
              aria-label={`Search ${label} options`}
              placeholder="Search by name or code"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        ) : null}
      </div>
      {visible.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((option) => (
            <article
              key={option.code}
              className="flex flex-col rounded-xl border border-border bg-card p-5 transition-colors hover:border-foreground/20 motion-reduce:transition-none"
            >
              <BookOpen
                aria-hidden="true"
                size={20}
                className="mb-4 text-primary"
              />
              <h3 className="text-base font-semibold">{option.name}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {option.code}
                {option.units ? ` · ${option.units} units` : ""}
              </p>
              {option.description ? (
                <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">
                  {option.description}
                </p>
              ) : null}
              <Button
                disabled={pending}
                className="mt-5 self-start"
                variant="outline"
                size="sm"
                onClick={() => onSelect(option)}
              >
                Choose {label}
                <ArrowRight aria-hidden="true" size={14} />
                <span className="sr-only">{option.name}</span>
              </Button>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-border px-5 py-10 text-center text-sm text-muted-foreground">
          {query
            ? "No matching options."
            : `No ${label} options are available for this degree.`}
        </div>
      )}
    </section>
  );
}
