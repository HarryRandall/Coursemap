"use client";
import { useId, useState } from "react";
import type { ProgrammeOption } from "@/lib/coursemap/onboarding-catalogue";
import { DegreeSummaryCard } from "@/ui/profile/degree-summary-card";
import {
  StructurePickerDialog,
  type StructurePickerKind,
} from "@/ui/profile/structure-picker-dialog";
import {
  StructureSlotsCard,
  type StructureSlot,
  type StructureSlotKind,
} from "@/ui/profile/structure-slots-card";

export type StudySelection = {
  majorCode: string;
  minorCodes: string[];
  specialisationCodes: string[];
};

const SLOTS: Array<{
  kind: StructureSlotKind;
  label: string;
  plural: string;
  fills: string[];
}> = [
  { kind: "major", label: "Major", plural: "Majors", fills: ["bg-chart-1"] },
  {
    kind: "minor",
    label: "Minor",
    plural: "Minors",
    fills: ["bg-chart-2", "bg-chart-3"],
  },
  {
    kind: "specialisation",
    label: "Specialisation",
    plural: "Specialisations",
    fills: ["bg-chart-4", "bg-chart-5"],
  },
];

/**
 * The student's course of study as they have chosen it: the degree and the
 * years it runs, then the major, minors and specialisations within it. The
 * catalogue of what could be chosen stays behind the picker.
 */
export function CourseOfStudyCard({
  degree,
  degrees,
  options,
  selection,
  commencementYear,
  catalogueYear,
  startYears,
  graduationYear,
  planningDuration,
  onStartYearChange,
  onDegreeChange,
  onSelectionChange,
}: {
  degree: ProgrammeOption | undefined;
  /** Every degree published for the plan's year. */
  degrees: ProgrammeOption[];
  /** The structures the chosen degree offers, by kind. */
  options: Record<StructureSlotKind, ProgrammeOption[]>;
  selection: StudySelection;
  commencementYear: number;
  catalogueYear: number;
  startYears: number[];
  graduationYear: number | null;
  planningDuration: number | null;
  onStartYearChange: (year: number) => void;
  onDegreeChange: (code: string) => void;
  onSelectionChange: (patch: Partial<StudySelection>) => void;
}) {
  const headingId = `${useId()}-degree`;
  const [picking, setPicking] = useState<StructurePickerKind | null>(null);
  const selectedCodes = (kind: StructureSlotKind) =>
    kind === "major"
      ? selection.majorCode
        ? [selection.majorCode]
        : []
      : kind === "minor"
        ? selection.minorCodes
        : selection.specialisationCodes;
  const setCodes = (kind: StructureSlotKind, codes: string[]) =>
    onSelectionChange(
      kind === "major"
        ? { majorCode: codes[0] ?? "" }
        : kind === "minor"
          ? { minorCodes: codes }
          : { specialisationCodes: codes },
    );

  const slots: StructureSlot[] = SLOTS.filter(
    (slot) => options[slot.kind].length > 0,
  ).map((slot) => ({
    kind: slot.kind,
    label: slot.label,
    plural: slot.plural,
    available: options[slot.kind].length,
    multiple: slot.kind !== "major",
    chosen: selectedCodes(slot.kind).flatMap((code, index) => {
      const option = options[slot.kind].find((item) => item.code === code);
      return option
        ? [{ option, fill: slot.fills[index % slot.fills.length] }]
        : [];
    }),
  }));
  // Named in the degree picker's warning, since a new degree clears them.
  const cleared = slots.flatMap((slot) =>
    slot.chosen.map(
      ({ option }) => `your ${option.name} ${slot.label.toLowerCase()}`,
    ),
  );

  return (
    <>
      <DegreeSummaryCard
        degree={degree}
        headingId={headingId}
        commencementYear={commencementYear}
        catalogueYear={catalogueYear}
        startYears={startYears}
        graduationYear={graduationYear}
        planningDuration={planningDuration}
        onStartYearChange={onStartYearChange}
        onChangeDegree={() => setPicking("degree")}
      />
      {degree ? (
        <StructureSlotsCard
          slots={slots}
          degreeUnits={degree.units}
          onPick={setPicking}
          onRemove={(kind, code) =>
            setCodes(
              kind,
              selectedCodes(kind).filter((item) => item !== code),
            )
          }
        />
      ) : null}

      {picking === "degree" ? (
        <StructurePickerDialog
          kind="degree"
          options={degrees}
          selected={degree ? [degree.code] : []}
          clears={cleared}
          onChange={([code]) => {
            if (code && code !== degree?.code) onDegreeChange(code);
          }}
          onClose={() => setPicking(null)}
        />
      ) : picking ? (
        <StructurePickerDialog
          kind={picking}
          options={options[picking]}
          selected={selectedCodes(picking)}
          multiple={picking !== "major"}
          onChange={(codes) => setCodes(picking, codes)}
          onClose={() => setPicking(null)}
        />
      ) : null}
    </>
  );
}
