import type { RequirementStageKind } from "@/lib/coursemap/requirement-stages";

/**
 * One fill per stage, shared by the composition bar and the stage headings
 * so a segment can be matched to its card. Stages that constrain or annotate
 * the degree take the border grey, since they hold no share of it.
 */
export const STAGE_FILL_CLASS: Record<RequirementStageKind, string> = {
  compulsory: "bg-chart-1",
  choices: "bg-chart-2",
  set: "bg-chart-3",
  pathways: "bg-chart-4",
  structures: "bg-chart-5",
  breadth: "bg-foreground/55",
  electives: "bg-muted-foreground/40",
  degree: "bg-border",
  limits: "bg-border",
  notes: "bg-border",
};
