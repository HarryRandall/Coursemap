"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@coursemap/ui/primitives/popover";
import {
  BULK_IMPORT_KINDS,
  importKindLabel,
  type BulkImportKind,
} from "@/lib/catalogue-runs/kinds";
import { cn } from "@/lib/cn";
import { MenuHint } from "@/ui/common/menu-hint";
import { OptionMenu } from "@/ui/common/option-menu";
import { routeIcons } from "@/ui/shell/route-icons";

// The sidebar's icons, so each import type looks like the catalogue section
// it fills.
const KIND_ICONS = {
  course: routeIcons.courses,
  major: routeIcons.majors,
  minor: routeIcons.minors,
  specialisation: routeIcons.specialisations,
} as const;

function kindTitle(kind: BulkImportKind) {
  const label = importKindLabel(kind);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** What a bulk import fills, built like the year picker beside it. */
export function ImportKindPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: BulkImportKind;
  onChange: (kind: BulkImportKind) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const Icon = KIND_ICONS[value];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <MenuHint label="Import type" open={open}>
        <PopoverTrigger asChild>
          <Button
            aria-label={`Import type: ${kindTitle(value)}`}
            disabled={disabled}
            type="button"
            variant="outline"
          >
            <Icon
              aria-hidden="true"
              className="text-muted-foreground/80"
              size={16}
            />
            <span className="font-medium">{kindTitle(value)}</span>
            <ChevronDown
              aria-hidden="true"
              className={cn(
                "text-muted-foreground/80 transition-transform motion-reduce:transition-none",
                open && "rotate-180",
              )}
              size={14}
            />
          </Button>
        </PopoverTrigger>
      </MenuHint>
      <PopoverContent
        align="end"
        className="w-auto min-w-(--radix-popover-trigger-width) p-1.5"
      >
        <OptionMenu
          items={BULK_IMPORT_KINDS.map((kind) => {
            const KindIcon = KIND_ICONS[kind];
            return {
              value: kind,
              label: kindTitle(kind),
              icon: <KindIcon aria-hidden="true" size={16} />,
            };
          })}
          value={value}
          onSelect={(next) => {
            setOpen(false);
            onChange(next as BulkImportKind);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
