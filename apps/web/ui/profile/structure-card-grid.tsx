"use client";
import Link from "next/link";
import { ArrowUpRight, Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { CATALOGUE_KIND_LABELS } from "@/lib/coursemap/catalogue-kinds";
import type { ProgrammeOption } from "@/lib/coursemap/onboarding-catalogue";

type StructureKind = "major" | "minor" | "specialisation";

/**
 * A degree's majors, minors or specialisations as cards to pick from, each
 * with what it is and a link to explore it in full. One kind allows a
 * single choice and the others several.
 */
export function StructureCardGrid({
  kind,
  options,
  selected,
  multiple,
  onChange,
}: {
  kind: StructureKind;
  options: ProgrammeOption[];
  selected: readonly string[];
  multiple: boolean;
  onChange: (codes: string[]) => void;
}) {
  const toggle = (code: string) => {
    const chosen = selected.includes(code);
    if (multiple)
      onChange(
        chosen ? selected.filter((item) => item !== code) : [...selected, code],
      );
    else onChange(chosen ? [] : [code]);
  };
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {options.map((option) => {
        const chosen = selected.includes(option.code);
        return (
          <li
            key={option.code}
            className={cn(
              "flex flex-col rounded-xl border bg-card transition",
              chosen
                ? "border-primary ring-1 ring-primary"
                : "border-border hover:border-muted-foreground/40",
            )}
          >
            <button
              type="button"
              aria-pressed={chosen}
              onClick={() => toggle(option.code)}
              className="flex flex-1 cursor-pointer flex-col gap-1.5 p-4 text-left"
            >
              <span className="flex items-start justify-between gap-3">
                <span className="text-sm leading-snug font-semibold text-foreground">
                  {option.name}
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid size-5 shrink-0 place-items-center border",
                    multiple ? "rounded-md" : "rounded-full",
                    chosen
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border",
                  )}
                >
                  {chosen ? <Check size={12} /> : null}
                </span>
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {option.code}
                {option.units ? ` · ${option.units} units` : ""}
              </span>
              {option.description ? (
                <span className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {option.description}
                </span>
              ) : null}
            </button>
            <Link
              href={`/${CATALOGUE_KIND_LABELS[kind].segment}/${option.catalogueYear}/${encodeURIComponent(option.code.toLowerCase())}`}
              className="flex items-center gap-1 border-t border-border px-4 py-2 text-xs font-medium text-primary hover:underline"
            >
              Explore
              <ArrowUpRight size={12} aria-hidden="true" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
