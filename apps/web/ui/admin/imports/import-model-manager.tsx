"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import { Input } from "@coursemap/ui/primitives/input";
import { Label } from "@coursemap/ui/primitives/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@coursemap/ui/primitives/dialog";
import {
  removeImportModel,
  saveImportModel,
  setImportModelVisibility,
} from "@/lib/admin/settings-actions";
import type { ImportModel } from "@/lib/admin/import-model";
import { ImportModelRow } from "./import-model-row";
import type { ImportModelRowAction } from "./import-model-row";
import { showToast } from "@/ui/common/toast";

export function ImportModelManager({
  open,
  onOpenChange,
  onCloseFocus,
  models,
  selected,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseFocus: () => void;
  models: ImportModel[];
  selected: string;
}) {
  const [id, setId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const visibleModels = models.filter((model) => model.visible);
  const hiddenModels = models.filter((model) => !model.visible);
  function save(model: string, action: "add" | ImportModelRowAction = "add") {
    setError(null);
    startTransition(async () => {
      try {
        const result = await (action === "remove"
          ? removeImportModel(model)
          : action === "show" || action === "hide"
            ? setImportModelVisibility(model, action === "show")
            : saveImportModel(model, action === "refresh"));
        if (!result.ok) {
          setError(result.message);
          return;
        }
        if (action === "add" && model === id) setId("");
        showToast(result.message);
        router.refresh();
      } catch {
        setError("The model could not be saved. Try again.");
      }
    });
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[min(36rem,85dvh)] flex-col overflow-hidden sm:max-w-lg"
        aria-describedby={undefined}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onCloseFocus();
        }}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>Manage import models</DialogTitle>
        </DialogHeader>
        <form
          className="shrink-0 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            save(id);
          }}
        >
          <Label htmlFor="import-model-id">OpenRouter model ID</Label>
          <div className="flex gap-2">
            <Input
              id="import-model-id"
              placeholder="anthropic/claude-sonnet-4.6"
              value={id}
              onChange={(event) => setId(event.target.value)}
              required
              maxLength={120}
              disabled={pending}
              autoComplete="off"
            />
            <Button type="submit" disabled={pending || !id.trim()}>
              Add model
            </Button>
          </div>
        </form>
        {error ? (
          <p role="alert" className="shrink-0 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="-mr-3 min-h-0 flex-1 [scrollbar-gutter:stable] overflow-y-auto overscroll-contain pr-3">
          <ul className="divide-y">
            {visibleModels.map((model) => (
              <ImportModelRow
                key={model.id}
                model={model}
                selected={selected === model.id}
                pending={pending}
                onAction={(action) => save(model.id, action)}
              />
            ))}
          </ul>
          {models.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No models configured.
            </p>
          ) : null}
        </div>
        {hiddenModels.length > 0 ? (
          <details className="group shrink-0 border-t pt-3">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-sm text-sm text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
              <ChevronDown
                aria-hidden="true"
                className="size-4 -rotate-90 group-open:rotate-0"
              />
              Hidden
              <span className="text-xs tabular-nums">
                {hiddenModels.length}
              </span>
            </summary>
            <ul className="mt-2 -mr-3 max-h-[min(12rem,25dvh)] [scrollbar-gutter:stable] divide-y overflow-y-auto overscroll-contain pr-3">
              {hiddenModels.map((model) => (
                <ImportModelRow
                  key={model.id}
                  model={model}
                  selected={false}
                  pending={pending}
                  onAction={(action) => save(model.id, action)}
                />
              ))}
            </ul>
          </details>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
