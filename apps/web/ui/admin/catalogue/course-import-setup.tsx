"use client";

import {
  useEffect,
  useId,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { BadgeCheck, Info, Sparkles, TriangleAlert } from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@coursemap/ui/primitives/card";
import { Checkbox } from "@coursemap/ui/primitives/checkbox";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@coursemap/ui/primitives/input-group";
import { Label } from "@coursemap/ui/primitives/label";
import { Skeleton } from "@coursemap/ui/primitives/skeleton";
import { Textarea } from "@coursemap/ui/primitives/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@coursemap/ui/primitives/tooltip";
import { cn } from "@/lib/cn";
import { MAX_SCOPE_STRUCTURES } from "@/lib/catalogue-runs/scope";
import {
  ImportStructurePicker,
  type ScopeStructure,
} from "./import-structure-picker";

export type ImportEstimate = {
  estimateKind: "measured" | "provisional" | "unavailable" | "not_used";
  estimateBasis: string;
};

const price = (value: number) => `US$${value.toFixed(2)}`;
const ceilingPrice = (value: number) => price(Math.ceil(value * 100) / 100);
const BUDGET_PRESETS = [0.5, 1, 2, 5];

function Segmented({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string | null;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex rounded-lg bg-muted p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-md px-3 py-1 text-xs font-medium text-muted-foreground transition outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
            value === option.value
              ? "bg-background text-foreground shadow-xs"
              : "hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function OptionCard({
  id,
  icon,
  title,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string;
  icon: ReactNode;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-xl border border-border p-4 transition hover:border-input",
        checked && "border-primary/50 bg-primary/5 hover:border-primary/60",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground [&>svg]:size-4",
          checked && "bg-primary/15 text-primary",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 space-y-1">
        <span id={`${id}-title`} className="block text-sm font-medium">
          {title}
        </span>
        <span
          id={`${id}-description`}
          className="block text-xs leading-relaxed text-muted-foreground"
        >
          {description}
        </span>
      </span>
      <Checkbox
        id={id}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        className="mt-0.5"
      />
    </label>
  );
}

/**
 * The form for starting a bulk import. It owns no data: the workspace keeps
 * the estimate, the limits and the run so this view can be replaced by the
 * progress screen without losing them.
 */
export function CourseImportSetup({
  kind,
  label,
  plural,
  year,
  preview,
  estimating,
  locked,
  available,
  selected,
  limit,
  onLimitChange,
  presets,
  codeFilter,
  onCodeFilterChange,
  budget,
  onBudgetChange,
  allowAi,
  onAllowAiChange,
  publishVerified,
  onPublishVerifiedChange,
  estimated,
  maximum,
  overBudget,
  onScopeReadyChange,
  start,
}: {
  kind: string;
  label: string;
  plural: string;
  year: number;
  preview: ImportEstimate | null;
  estimating: boolean;
  /** True while a run is starting or running, when nothing may change. */
  locked: boolean;
  available: number;
  selected: number;
  limit: number;
  onLimitChange: (value: number) => void;
  presets: { label: string; value: number }[];
  codeFilter: string;
  onCodeFilterChange: (value: string) => void;
  budget: number;
  onBudgetChange: (value: number) => void;
  allowAi: boolean;
  onAllowAiChange: (value: boolean) => void;
  publishVerified: boolean;
  onPublishVerifiedChange: (value: boolean) => void;
  estimated: number | null;
  maximum: number | null;
  overBudget: boolean;
  /**
   * False while the chosen scope cannot be estimated yet, such as a degree
   * still resolving to its courses. An empty code list means every missing
   * record, so the workspace must not preview or start until this is true.
   */
  onScopeReadyChange: (ready: boolean) => void;
  start: ReactNode;
}) {
  const id = useId();
  const [scope, setScope] = useState<"all" | "codes" | "structures">(
    codeFilter.trim() ? "codes" : "all",
  );
  const [structures, setStructures] = useState<ScopeStructure[] | null>(null);
  const [chosen, setChosen] = useState<number[]>([]);
  const [scopeError, setScopeError] = useState("");
  // Degrees and majors only name courses, so only course imports offer them.
  const offerStructures = kind === "course";

  useEffect(() => {
    if (scope !== "structures" || structures !== null) return;
    let stopped = false;
    fetch(`/api/admin/course-import-runs?year=${year}&scope=structures`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (!stopped) setStructures(data.structures);
      })
      .catch(() => {
        if (!stopped) {
          setStructures([]);
          setScopeError("Degrees and majors could not be loaded.");
        }
      });
    return () => {
      stopped = true;
    };
  }, [scope, structures, year]);

  async function chooseStructures(next: number[]) {
    setChosen(next);
    setScopeError("");
    if (next.length === 0) {
      onScopeReadyChange(false);
      onCodeFilterChange("");
      return;
    }
    onScopeReadyChange(false);
    try {
      const response = await fetch(
        `/api/admin/course-import-runs?year=${year}&scopeRecords=${next.join(",")}`,
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      onCodeFilterChange(data.codes.join(" "));
      onScopeReadyChange(data.codes.length > 0);
    } catch (cause) {
      setScopeError(
        cause instanceof Error && cause.message
          ? cause.message
          : "Courses for that choice could not be loaded.",
      );
    }
  }

  function changeScope(next: string) {
    const value = next as typeof scope;
    setScope(value);
    setChosen([]);
    setScopeError("");
    onCodeFilterChange("");
    onScopeReadyChange(value !== "structures");
  }

  const chosenNames = chosen
    .map((recordId) => structures?.find((entry) => entry.recordId === recordId))
    .filter((entry): entry is ScopeStructure => Boolean(entry))
    .map((entry) => entry.name);
  const codeCount = codeFilter.trim()
    ? codeFilter
        .trim()
        .split(/[\s,]+/)
        .filter(Boolean).length
    : 0;
  const countDisabled = !preview || available === 0 || locked;
  const fill = available > 1 ? ((selected - 1) / (available - 1)) * 100 : 0;
  // The meter's scale covers both the limit and the worst case, so either
  // one running past the other is visible.
  const scale = Math.max(budget, maximum ?? 0, 0.01);
  const status = !preview
    ? "Loading current prices..."
    : !allowAi
      ? "AI is disabled. This import has no AI spend."
      : available === 0
        ? `No missing ${plural}. Refresh the ANU listing if you expect more.`
        : overBudget
          ? `May pause at your ${price(budget)} spending limit.`
          : `Within your ${price(budget)} spending limit.`;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Which {plural}</h2>
            </CardTitle>
            <CardDescription>
              Existing imports and drafts are skipped.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Segmented
              label={`Choose ${plural}`}
              value={scope}
              disabled={locked}
              onChange={changeScope}
              options={[
                { value: "all", label: "All missing" },
                ...(offerStructures
                  ? [{ value: "structures", label: "From a degree or major" }]
                  : []),
                { value: "codes", label: "Specific codes" },
              ]}
            />
            {scope === "structures" ? (
              <div className="space-y-2">
                <ImportStructurePicker
                  structures={structures}
                  selected={chosen}
                  max={MAX_SCOPE_STRUCTURES}
                  disabled={locked}
                  onSelectedChange={(next) => void chooseStructures(next)}
                />
                {scopeError ? (
                  <p role="alert" className="text-xs text-destructive">
                    {scopeError}
                  </p>
                ) : chosen.length && codeCount ? (
                  <p className="text-xs text-muted-foreground">
                    {codeCount} {codeCount === 1 ? "course is" : "courses are"}{" "}
                    named. Ones already imported are skipped.
                  </p>
                ) : null}
              </div>
            ) : null}
            {scope === "codes" ? (
              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-3">
                  <Label htmlFor={`${id}-codes`}>Only these codes</Label>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {codeCount} {codeCount === 1 ? "code" : "codes"}
                  </span>
                </div>
                <Textarea
                  id={`${id}-codes`}
                  value={codeFilter}
                  disabled={locked}
                  placeholder="COMP1100, COMP1110, MATH1013"
                  aria-describedby={`${id}-codes-help`}
                  className="min-h-20 font-mono text-[13px]"
                  onChange={(event) => onCodeFilterChange(event.target.value)}
                />
                <p
                  id={`${id}-codes-help`}
                  className="text-xs text-muted-foreground"
                >
                  Separate codes with commas, spaces or new lines.
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <h2>How many</h2>
            </CardTitle>
            <CardDescription>
              {preview
                ? `${selected} of ${available} missing`
                : `Loading ${plural}...`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <input
              aria-label={`${label} to import`}
              className="range-input w-full"
              style={{ "--range-fill": `${fill}%` } as CSSProperties}
              type="range"
              min={available ? 1 : 0}
              max={Math.max(1, available)}
              value={selected}
              disabled={countDisabled}
              onChange={(event) => onLimitChange(Number(event.target.value))}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Segmented
                label="Quick amounts"
                value={
                  presets.find((preset) => preset.value === selected)?.label ??
                  null
                }
                disabled={countDisabled}
                onChange={(value) =>
                  onLimitChange(
                    presets.find((preset) => preset.label === value)!.value,
                  )
                }
                options={presets.map((preset) => ({
                  value: preset.label,
                  label: preset.label,
                }))}
              />
              <InputGroup className="w-32">
                <InputGroupInput
                  aria-label={`Exact ${kind} count`}
                  type="number"
                  min={available ? 1 : 0}
                  max={available || undefined}
                  value={limit}
                  disabled={countDisabled}
                  onChange={(event) =>
                    onLimitChange(Number(event.target.value))
                  }
                />
                <InputGroupAddon align="inline-end">{plural}</InputGroupAddon>
              </InputGroup>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2">
          <OptionCard
            id={`${id}-ai`}
            icon={<Sparkles />}
            title="Use AI for ambiguous requirements"
            description={
              allowAi
                ? "Source data is read first. AI only interprets requirements Coursemap cannot safely parse."
                : "Source data only. Ambiguous requirements are kept for review."
            }
            checked={allowAi}
            disabled={locked}
            onCheckedChange={onAllowAiChange}
          />
          <OptionCard
            id={`${id}-publish`}
            icon={<BadgeCheck />}
            title={`Auto-publish verified ${plural}`}
            description="Uncertain fields stay in drafts for review."
            checked={publishVerified}
            disabled={locked}
            onCheckedChange={onPublishVerifiedChange}
          />
        </div>
      </div>

      <Card className="h-fit lg:h-full">
        <CardHeader>
          <CardTitle>
            <h2>
              {preview
                ? `${selected} ${selected === 1 ? kind : plural}, ${year}`
                : `${label}, ${year}`}
            </h2>
          </CardTitle>
          <CardDescription>
            {scope === "structures"
              ? chosenNames.length
                ? `From ${chosenNames[0]}${chosenNames.length > 1 ? ` and ${chosenNames.length - 1} more` : ""}`
                : "Choose a degree or major"
              : codeCount
                ? `${codeCount} listed ${codeCount === 1 ? "code" : "codes"}`
                : "All missing records"}
            {publishVerified ? ", auto-publish on" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-5">
          <section
            aria-label="Import costs"
            aria-busy={estimating}
            className="space-y-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Estimated</p>
                {preview ? (
                  <p className="text-3xl font-semibold tracking-tight tabular-nums">
                    {estimated === null ? "--" : price(estimated)}
                  </p>
                ) : (
                  <Skeleton className="mt-1 h-9 w-28" />
                )}
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Estimate details"
                    className="h-auto gap-1 px-1.5 py-0.5 text-xs text-muted-foreground"
                  >
                    {preview?.estimateKind === "measured"
                      ? "Measured"
                      : preview?.estimateKind === "not_used"
                        ? "AI disabled"
                        : preview?.estimateKind === "unavailable"
                          ? "No sample"
                          : "Provisional"}
                    <Info className="size-3" aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {preview?.estimateBasis ?? "Loading current model prices."}
                  {preview?.estimateKind !== "not_used" &&
                    " Min assumes no paid requests; Max assumes every request uses its token allowance."}
                </TooltipContent>
              </Tooltip>
            </div>
            {allowAi && !preview ? (
              <div aria-hidden="true" className="space-y-2">
                <Skeleton className="h-2 w-full rounded-full" />
                <div className="flex justify-between">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            ) : null}
            {allowAi && preview ? (
              <div className="space-y-1.5">
                <div
                  aria-hidden="true"
                  className="relative h-2 overflow-hidden rounded-full bg-muted"
                >
                  {maximum !== null ? (
                    <span
                      className={cn(
                        "absolute inset-y-0 left-0 rounded-full",
                        overBudget ? "bg-warning/40" : "bg-primary/30",
                      )}
                      style={{
                        width: `${Math.min(100, (maximum / scale) * 100)}%`,
                      }}
                    />
                  ) : null}
                  {estimated !== null ? (
                    <span
                      className="absolute inset-y-0 left-0 rounded-full bg-primary"
                      style={{
                        width: `${Math.min(100, (estimated / scale) * 100)}%`,
                      }}
                    />
                  ) : null}
                  {maximum !== null ? (
                    <span
                      className="absolute inset-y-0 w-0.5 bg-foreground"
                      style={{
                        left: `calc(${(budget / scale) * 100}% - 1px)`,
                      }}
                    />
                  ) : null}
                </div>
                <dl className="flex justify-between text-xs text-muted-foreground tabular-nums">
                  <div className="flex gap-1">
                    <dt>Min</dt>
                    <dd>US$0.00</dd>
                  </div>
                  <div className="flex gap-1">
                    <dt>Max</dt>
                    <dd className="text-foreground">
                      {maximum === null ? "..." : ceilingPrice(maximum)}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : null}
            <p
              role={overBudget ? "alert" : "status"}
              className={cn(
                "flex items-start gap-2 rounded-lg px-3 py-2 text-xs",
                overBudget
                  ? "bg-warning/10 text-warning-foreground dark:text-warning"
                  : "bg-muted/60 text-muted-foreground",
              )}
            >
              {overBudget ? (
                <TriangleAlert
                  className="mt-0.5 size-3 shrink-0"
                  aria-hidden="true"
                />
              ) : null}
              {status}
            </p>
          </section>

          {allowAi ? (
            <div className="space-y-2">
              <Label htmlFor={`${id}-budget`}>Spending limit</Label>
              <InputGroup>
                <InputGroupAddon>US$</InputGroupAddon>
                <InputGroupInput
                  id={`${id}-budget`}
                  type="number"
                  min={0.01}
                  max={10}
                  step={0.01}
                  value={budget}
                  disabled={locked}
                  onChange={(event) =>
                    onBudgetChange(Number(event.target.value))
                  }
                />
              </InputGroup>
              <div className="flex gap-1.5">
                {BUDGET_PRESETS.map((value) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant="outline"
                    aria-pressed={budget === value}
                    disabled={locked}
                    className={cn(
                      "h-7 flex-1 px-0 text-xs tabular-nums",
                      budget === value &&
                        "border-primary/50 bg-primary/10 text-primary",
                    )}
                    onClick={() => onBudgetChange(value)}
                  >
                    ${value % 1 ? value.toFixed(2) : value}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          {/* Pinned to the foot so the button lines up with the bottom of
              the options, however tall the left column grows. */}
          <div className="mt-auto">{start}</div>
        </CardContent>
      </Card>
    </div>
  );
}
