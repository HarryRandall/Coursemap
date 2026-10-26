"use client";

import { useEffect } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@coursemap/ui/primitives/dropdown-menu";
import { useAssistant } from "./assistant-provider";
import { ImportModelLogo } from "@/ui/admin/imports/import-model-logo";

export function AssistantModelPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { catalogue, loadModels } = useAssistant();
  useEffect(() => {
    loadModels();
  }, [loadModels]);
  const selected =
    catalogue?.models.find((model) => model.id === value) ??
    catalogue?.models.find((model) => model.id === catalogue.defaultModel);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="max-w-[calc(100%-7rem)] min-w-0"
          aria-label="Assistant model"
        >
          {selected ? (
            <ImportModelLogo model={selected.id} className="size-4 shrink-0" />
          ) : null}
          <span className="truncate">
            {selected?.name ??
              (catalogue ? "Choose model" : "Loading models...")}
          </span>
          <ChevronDown aria-hidden="true" className="size-4 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="top"
        className="max-w-[calc(100vw-2rem)] min-w-64"
      >
        <DropdownMenuLabel>Model</DropdownMenuLabel>
        {catalogue?.models.map((model) => (
          <DropdownMenuItem
            key={model.id}
            onSelect={() => onChange(model.id)}
            aria-label={`${model.name}${selected?.id === model.id ? ", selected" : ""}`}
          >
            <ImportModelLogo model={model.id} className="size-5 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{model.name}</span>
              {model.description ? (
                <span className="block text-xs text-muted-foreground">
                  {model.description}
                </span>
              ) : null}
            </span>
            {selected?.id === model.id ? (
              <Check aria-hidden="true" className="size-4" />
            ) : null}
          </DropdownMenuItem>
        ))}
        {!catalogue?.models.length ? (
          <div className="max-w-64 px-2 py-2 text-xs text-muted-foreground">
            {catalogue?.error ??
              (catalogue ? "No models available." : "Loading models...")}
          </div>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
