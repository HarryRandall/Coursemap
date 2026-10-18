import { ArrowUpRight, Plus, X } from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import { cn } from "@/lib/cn";
import { publicCatalogueRecordPath } from "@/lib/coursemap/catalogue-kinds";
import type { ProgrammeOption } from "@/lib/coursemap/onboarding-catalogue";
import { UnitsComposition } from "@/ui/common/units-composition";
import type { StructurePickerKind } from "@/ui/profile/structure-picker-dialog";

export type StructureSlotKind = Exclude<StructurePickerKind, "degree">;

export type StructureSlot = {
  kind: StructureSlotKind;
  /** The kind's name, singular and plural. */
  label: string;
  plural: string;
  /** What is chosen, each with the colour of its share of the bar. */
  chosen: Array<{ option: ProgrammeOption; fill: string }>;
  /** How many the degree offers for this kind. */
  available: number;
  multiple: boolean;
};

/**
 * The major, minors and specialisations chosen within the degree: how their
 * units share the degree's total, then a row per kind listing what is chosen
 * beside the button that adds or changes it.
 */
export function StructureSlotsCard({
  slots,
  degreeUnits,
  onPick,
  onRemove,
}: {
  slots: StructureSlot[];
  degreeUnits: number | null;
  onPick: (kind: StructureSlotKind) => void;
  onRemove: (kind: StructureSlotKind, code: string) => void;
}) {
  const segments = slots.flatMap((slot) =>
    slot.chosen.flatMap(({ option, fill }) =>
      option.units
        ? [
            {
              key: `${slot.kind}-${option.code}`,
              title: option.name,
              units: option.units,
              fill,
            },
          ]
        : [],
    ),
  );
  const chosenUnits = segments.reduce((sum, segment) => sum + segment.units, 0);
  const total = degreeUnits && chosenUnits <= degreeUnits ? degreeUnits : null;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="space-y-4 px-5 pt-5 pb-4 sm:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-foreground">
            Majors, minors and specialisations
          </h2>
          {slots.length && degreeUnits ? (
            <p className="text-[13px] text-muted-foreground tabular-nums">
              {chosenUnits} of {degreeUnits} units
            </p>
          ) : null}
        </div>
        {slots.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This degree has no majors, minors or specialisations to choose.
          </p>
        ) : (
          <UnitsComposition
            segments={segments}
            total={total}
            spare={
              total !== null
                ? { title: "Core and electives", units: total - chosenUnits }
                : null
            }
            label={`${chosenUnits} of ${degreeUnits ?? chosenUnits} units in your chosen major, minors and specialisations`}
          />
        )}
      </div>
      {slots.length ? (
        <ul className="divide-y divide-border border-t border-border">
          {slots.map((slot) => {
            const canAdd = slot.multiple
              ? slot.chosen.length < slot.available
              : slot.chosen.length === 0;
            return (
              <li
                key={slot.kind}
                className="grid gap-3 px-5 py-4 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-center sm:px-6"
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {slot.multiple ? slot.plural : slot.label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {slot.available} available
                  </p>
                </div>
                <ul className="flex min-w-0 flex-wrap gap-2">
                  {slot.chosen.length === 0 ? (
                    <li className="text-sm text-muted-foreground">
                      None chosen
                    </li>
                  ) : (
                    slot.chosen.map(({ option, fill }) => (
                      <li
                        key={option.code}
                        className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-muted/30 py-1 pr-1 pl-3"
                      >
                        <span
                          aria-hidden="true"
                          className={cn("size-2 shrink-0 rounded-full", fill)}
                        />
                        <a
                          href={publicCatalogueRecordPath(
                            slot.kind,
                            option.catalogueYear,
                            option.code,
                          )}
                          target="_blank"
                          rel="noopener"
                          className="flex min-w-0 items-center gap-1 text-sm font-medium text-foreground outline-none hover:underline focus-visible:underline"
                        >
                          <span className="truncate">{option.name}</span>
                          <ArrowUpRight
                            aria-hidden="true"
                            className="size-3.5 shrink-0 text-muted-foreground"
                          />
                          <span className="sr-only">(opens in a new tab)</span>
                        </a>
                        {option.units ? (
                          <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                            {option.units} units
                          </span>
                        ) : null}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Remove ${option.name}`}
                          onClick={() => onRemove(slot.kind, option.code)}
                        >
                          <X aria-hidden="true" />
                        </Button>
                      </li>
                    ))
                  )}
                </ul>
                <Button
                  type="button"
                  variant="outline"
                  className="justify-self-start sm:justify-self-end"
                  onClick={() => onPick(slot.kind)}
                >
                  {canAdd ? <Plus aria-hidden="true" /> : null}
                  {!canAdd
                    ? slot.multiple
                      ? `Change ${slot.plural.toLowerCase()}`
                      : `Change ${slot.kind}`
                    : slot.chosen.length
                      ? `Add another ${slot.kind}`
                      : `Add a ${slot.kind}`}
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
