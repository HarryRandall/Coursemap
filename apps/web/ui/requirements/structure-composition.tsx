import {
  FILLING_STAGE_KINDS,
  structureComposition,
  type RequirementStage,
} from "@/lib/coursemap/requirement-stages";
import { UnitsComposition } from "@/ui/common/units-composition";
import { formatUnits } from "@/ui/requirements/requirement-presentation";
import { STAGE_FILL_CLASS } from "@/ui/requirements/requirement-stage-colours";

/**
 * How a structure's units divide between its stages. Where the stages
 * overlap or the target is unknown, the legend stands alone rather than a
 * bar that would misstate the shares. Renders nothing when no stage is sized.
 */
export function StructureComposition({
  stages,
  unitTarget,
  className,
}: {
  stages: readonly RequirementStage[];
  unitTarget: number | null;
  className?: string;
}) {
  const composition = structureComposition(stages, unitTarget);
  const entries = composition
    ? composition.segments
    : stages
        .filter(
          (stage) =>
            FILLING_STAGE_KINDS.has(stage.kind) &&
            stage.units !== null &&
            stage.units > 0,
        )
        .map((stage) => ({
          kind: stage.kind,
          title: stage.title,
          units: stage.units as number,
        }));
  if (entries.length === 0) return null;
  const total = composition ? (unitTarget ?? composition.allocated) : null;
  return (
    <UnitsComposition
      className={className}
      segments={entries.map((entry) => ({
        key: `${entry.kind}-${entry.title}`,
        title: entry.title,
        units: entry.units,
        fill: STAGE_FILL_CLASS[entry.kind],
      }))}
      total={total}
      spare={
        composition && composition.unallocated !== null
          ? {
              title: composition.complete ? "Unspecified" : "Other rules",
              units: composition.unallocated,
            }
          : null
      }
      label={
        composition && total !== null
          ? `${formatUnits(composition.allocated)} of ${formatUnits(total)} set out across ${entries.length} ${entries.length === 1 ? "stage" : "stages"}`
          : "Stages"
      }
    />
  );
}
