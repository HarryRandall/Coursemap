"use client";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@coursemap/ui/primitives/tooltip";
import { Button } from "@coursemap/ui/primitives/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@coursemap/ui/primitives/popover";

import { useState, useTransition } from "react";
import { ChevronDown, Download, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { MenuHint } from "@/ui/common/menu-hint";

import { toast } from "sonner";
import { setImportModel } from "@/lib/admin/settings-actions";

import { ImportModelLogo } from "@/ui/admin/imports/import-model-logo";
import { OptionMenu } from "@/ui/common/option-menu";

function ModelName({ model }: { model: string }) {
  const separator = model.lastIndexOf("/");
  const provider = separator === -1 ? "" : model.slice(0, separator + 1);
  const name = separator === -1 ? model : model.slice(separator + 1);

  return (
    <span className="min-w-0 truncate tracking-tight">
      {provider ? (
        <span className="text-muted-foreground/80">{provider}</span>
      ) : null}
      <span className="font-medium text-foreground/90">{name}</span>
    </span>
  );
}

function SelectionQuota({
  blockedKey,
  selected,
  maximum,
}: {
  blockedKey: number;
  selected: number;
  maximum: number;
}) {
  const percentage = Math.min(100, (selected / maximum) * 100);
  // Re-keying on every growth restarts the swell; shrinking the selection
  // stays quiet so removals do not read as another addition. Adjusting the
  // state during render keeps the new key in the same commit as the count.
  const [pulse, setPulse] = useState({ key: 0, seen: selected });
  if (pulse.seen !== selected) {
    setPulse({
      key: selected > pulse.seen ? pulse.key + 1 : pulse.key,
      seen: selected,
    });
  }

  return (
    <span
      aria-hidden="true"
      className="relative grid size-5 shrink-0 animate-count-pop place-items-center rounded-full motion-reduce:animate-none"
      key={pulse.key}
      style={{
        background: `conic-gradient(var(--primary) ${percentage}%, var(--border) ${percentage}% 100%)`,
      }}
    >
      {blockedKey > 0 ? (
        // Fades back to the brand ring on its own, so the refusal reads as a
        // moment rather than a new resting state.
        <span
          className="absolute inset-0 animate-limit-ring rounded-full bg-rose-600 opacity-0 motion-reduce:animate-none"
          key={blockedKey}
        />
      ) : null}
      <span className="relative size-2.5 rounded-full bg-card" />
    </span>
  );
}

/**
 * Bulk-action bar for a directory table. It floats over the table rather than
 * sitting in the page flow so the row you just ticked stays where it was, and
 * it only exists while something is selected.
 */
export function DirectorySelectionBar({
  canManageModel,
  disabledReason,
  importModel,
  limitSignal = 0,
  maximum = 10,
  modelOptions,
  onClear,
  onImport,
  selected,
  submitting,
}: {
  canManageModel: boolean;
  disabledReason: string | null;
  importModel: string;
  /** Increment to replay the "selection is full" rebuff on this bar. */
  limitSignal?: number;
  maximum?: number;
  modelOptions: string[];
  onClear: () => void;
  onImport: (model: string) => void;
  selected: number;
  submitting: boolean;
}) {
  const [modelOpen, setModelOpen] = useState(false);
  // Re-keying replays the animation for a second refusal; without it the
  // browser treats the class as unchanged and nothing moves.
  const [blocked, setBlocked] = useState({ key: 0, seen: limitSignal });
  if (blocked.seen !== limitSignal) {
    setBlocked({ key: blocked.key + 1, seen: limitSignal });
  }
  // Holds the choice only until the server prop catches up, so a saved model
  // is never shown as pending and a failed save falls back on its own.
  const [draft, setDraft] = useState<{ from: string; model: string } | null>(
    null,
  );
  const [savingModel, startSaving] = useTransition();
  const model = draft?.from === importModel ? draft.model : importModel;

  if (selected === 0) return null;

  function chooseModel(next: string) {
    setModelOpen(false);
    setDraft({ from: importModel, model: next });
    startSaving(async () => {
      const result = await setImportModel(next);
      if (result.ok) {
        toast.success(result.message);
        return;
      }
      setDraft(null);
      toast.error(result.message);
    });
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
      <div
        aria-live="polite"
        className={cn(
          "pointer-events-auto flex max-w-full items-center gap-3 rounded-2xl border border-input/80 bg-card p-2 pl-3.5 shadow-2xl ring-1 shadow-zinc-950/15 ring-zinc-950/5",
          blocked.key > 0 && "animate-limit-nudge motion-reduce:animate-none",
        )}
        key={blocked.key}
        role="status"
      >
        <span className="flex shrink-0 items-center gap-2">
          <SelectionQuota
            blockedKey={blocked.key}
            maximum={maximum}
            selected={selected}
          />
          <span
            className={cn(
              "text-sm whitespace-nowrap text-muted-foreground",
              blocked.key > 0 &&
                "animate-limit-flash motion-reduce:animate-none",
            )}
          >
            <span className="font-semibold text-foreground tabular-nums">
              {selected}
            </span>{" "}
            of {maximum} selected
          </span>
        </span>

        <span aria-hidden="true" className="h-6 w-px bg-accent" />

        {disabledReason ? (
          <span
            className="max-w-56 truncate px-1 text-xs font-medium text-amber-700 dark:text-amber-300"
            title={disabledReason}
          >
            {disabledReason}
          </span>
        ) : (
          <Popover onOpenChange={setModelOpen} open={modelOpen}>
            <MenuHint
              label={
                canManageModel
                  ? "Change the import model"
                  : "Imports run on this model"
              }
              open={modelOpen}
            >
              <PopoverTrigger asChild>
                <button
                  aria-label={`Import model: ${model}`}
                  className="hidden h-8 max-w-64 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-[13px] transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 data-[state=open]:bg-accent sm:inline-flex"
                  disabled={!canManageModel || savingModel}
                  type="button"
                >
                  <ImportModelLogo model={model} className="size-4" />
                  <ModelName model={model} />
                  <ChevronDown
                    aria-hidden="true"
                    className="shrink-0 text-muted-foreground/80"
                    size={13}
                  />
                </button>
              </PopoverTrigger>
            </MenuHint>
            <PopoverContent align="center" className="w-72 p-1.5" side="top">
              <OptionMenu
                items={modelOptions.map((option) => ({
                  value: option,
                  label: option,
                  icon: <ImportModelLogo model={option} className="size-4" />,
                  render: <ModelName model={option} />,
                }))}
                onSelect={chooseModel}
                value={model}
              />
            </PopoverContent>
          </Popover>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="inline-flex"
              tabIndex={
                disabledReason !== null || savingModel || submitting
                  ? 0
                  : undefined
              }
            >
              <Button
                className="h-8 rounded-lg"
                disabled={disabledReason !== null || savingModel || submitting}
                onClick={() => onImport(model)}
                size="sm"
                variant="default"
                type="button"
              >
                <Download aria-hidden="true" size={14} />
                {submitting ? "Starting..." : "Import"}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {disabledReason ?? "Queue the selected entries"}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              aria-label="Clear the selection"
              className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg text-muted-foreground/80 transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              onClick={onClear}
              type="button"
            >
              <X aria-hidden="true" size={15} />
            </button>
          </TooltipTrigger>
          <TooltipContent>{"Clear the selection"}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
