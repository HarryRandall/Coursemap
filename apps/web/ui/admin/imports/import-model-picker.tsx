"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronsUpDown,
  CircleAlert,
  Cpu,
  Plus,
  Settings2,
} from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@coursemap/ui/primitives/dropdown-menu";
import { setImportModel } from "@/lib/admin/settings-actions";
import type { ImportModel } from "@/lib/admin/import-model";
import { cn } from "@/lib/cn";
import { ImportModelLogo } from "./import-model-logo";
import { ImportModelPrice } from "./import-model-price";
import { ImportModelManager } from "./import-model-manager";
import { Hint } from "@/ui/common/hint";
import { showToast } from "@/ui/common/toast";
import { formatCanberraDate } from "@/lib/canberra-format";

/**
 * The default model for catalogue syncs, as a compact picker that sits in the
 * header of the sync panel it governs rather than as a card of its own.
 */
export function ImportModelPicker({
  canManage,
  model,
  models,
  updatedAt,
  error,
}: {
  canManage: boolean;
  model: string;
  models: ImportModel[];
  updatedAt: string | null;
  error?: string | null;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [managerOpen, setManagerOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const selected = models.find((entry) => entry.id === model);
  function choose(next: string) {
    startTransition(async () => {
      try {
        const result = await setImportModel(next);
        if (!result.ok) {
          showToast(result.message, "error");
          return;
        }
        showToast(result.message);
        router.refresh();
      } catch {
        showToast("Couldn't save the default model. Try again.", "error");
      }
    });
  }
  const hint = error
    ? error
    : !canManage
      ? "Import management permission is required to change this."
      : `Default model for catalogue syncs${
          updatedAt ? `, updated ${formatCanberraDate(updatedAt)}` : ""
        }`;
  return (
    <div className="flex min-w-0 items-center">
      <DropdownMenu>
        <Hint label={hint} side="bottom" align="end">
          {/* Disabled buttons fire no pointer events, so the hint sits on a
              wrapper that still does. */}
          <span className="inline-flex min-w-0">
            <DropdownMenuTrigger asChild>
              <Button
                ref={triggerRef}
                variant="outline"
                size="sm"
                className="h-8 max-w-full min-w-0 gap-2 pr-2 pl-1.5"
                disabled={!canManage || pending || Boolean(error)}
                aria-label="Import model"
              >
                <span
                  className="grid size-5 shrink-0 place-items-center overflow-hidden rounded-sm bg-muted"
                  aria-hidden="true"
                >
                  {error ? (
                    <CircleAlert className="size-3.5 text-destructive" />
                  ) : selected ? (
                    <ImportModelLogo model={selected.id} className="size-4" />
                  ) : (
                    <Cpu className="size-3.5" />
                  )}
                </span>
                <span className="min-w-0 truncate text-xs font-medium">
                  {error
                    ? "Models unavailable"
                    : (selected?.name ?? "Add an import model")}
                </span>
                {selected && !error ? (
                  <ImportModelPrice model={selected} />
                ) : null}
                <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
          </span>
        </Hint>
        <DropdownMenuContent
          align="end"
          className="flex max-w-[calc(100vw-2rem)] min-w-72 flex-col overflow-hidden"
        >
          <div className="max-h-63 min-h-0 overflow-y-auto overscroll-contain">
            {models
              .filter((entry) => entry.visible)
              .map((entry) => (
                <DropdownMenuItem
                  key={entry.id}
                  onSelect={() => choose(entry.id)}
                  className={cn(
                    "h-14 gap-3 py-2.5",
                    entry.id === model
                      ? "bg-primary/10 text-primary data-highlighted:bg-primary/10 data-highlighted:text-primary"
                      : // --accent is mixed against the page, so on the lighter
                        // popover surface it disappears in dark. Mix from the
                        // foreground, which reads on either ground.
                        "data-highlighted:bg-foreground/8 data-highlighted:text-foreground",
                  )}
                  aria-label={`${entry.name}, ${entry.provider}${entry.id === model ? ", selected" : ""}`}
                >
                  <span
                    className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold"
                    aria-hidden="true"
                  >
                    <ImportModelLogo model={entry.id} className="size-6" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {entry.name}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {entry.provider}
                    </span>
                  </span>
                  <ImportModelPrice model={entry} />
                </DropdownMenuItem>
              ))}
          </div>
          <DropdownMenuSeparator className="shrink-0" />
          <DropdownMenuItem
            className="shrink-0"
            onSelect={() => setManagerOpen(true)}
          >
            <Plus />
            Add model
          </DropdownMenuItem>
          <DropdownMenuItem
            className="shrink-0"
            onSelect={() => setManagerOpen(true)}
          >
            <Settings2 />
            Manage models
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {canManage ? (
        <ImportModelManager
          open={managerOpen}
          onOpenChange={setManagerOpen}
          onCloseFocus={() => triggerRef.current?.focus()}
          models={models}
          selected={model}
        />
      ) : null}
    </div>
  );
}
