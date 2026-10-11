"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { Badge } from "@coursemap/ui/components/badge";
import { Button } from "@coursemap/ui/primitives/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@coursemap/ui/primitives/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@coursemap/ui/primitives/tooltip";
import { useCoursemap } from "@/app/providers";
import { OVERRIDE_REASONS } from "@/lib/coursemap/plan-overrides";
import { PlanOverrideDialog } from "@/ui/common/plan-override-dialog";

export function RequirementOverrideControl({
  structureCode,
  requirementKey,
}: {
  structureCode: string;
  requirementKey: string;
}) {
  const { state, overrideRequirement, notify } = useCoursemap();
  const [open, setOpen] = useState(false);
  const override = state.requirementOverrides?.find(
    (item) =>
      item.structureCode === structureCode &&
      item.requirementKey === requirementKey,
  );
  async function undo() {
    const result = await overrideRequirement(
      structureCode,
      requirementKey,
      null,
    );
    notify(result.message, result.ok ? "success" : "error");
  }
  return (
    <div className="relative z-10 flex items-center gap-1">
      {override ? (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" tabIndex={0}>
                Marked satisfied
              </Badge>
            </TooltipTrigger>
            <TooltipContent>{OVERRIDE_REASONS[override.reason]}</TooltipContent>
          </Tooltip>
          <Button size="sm" variant="ghost" onClick={() => void undo()}>
            Undo
          </Button>
        </>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Requirement options"
            >
              <MoreHorizontal size={15} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={() => setOpen(true)}>
              Mark as satisfied
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {open ? (
        <PlanOverrideDialog
          title="Mark requirement as satisfied"
          requirement
          onClose={() => setOpen(false)}
          onSave={(value) =>
            overrideRequirement(structureCode, requirementKey, value)
          }
        />
      ) : null}
    </div>
  );
}
