"use client";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@coursemap/ui/primitives/popover";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Copy,
  ExternalLink,
  Eye,
  History,
  MoreVertical,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@coursemap/ui/primitives/button";
import { OptionMenu } from "@/ui/common/option-menu";

import styles from "./catalogue-table.module.css";

type Action = {
  label: string;
  href: string;
  icon?: "view" | "source" | "history";
};
export function CatalogueRowActions({
  code,
  label,
  disabled = false,
  extraActions = [],
  links,
  onSelectForImport,
}: {
  disabled?: boolean;
  code?: string;
  label?: string;
  extraActions?: { label: string; icon: ReactNode; onSelect: () => void }[];
  links: Action[];
  onSelectForImport?: () => void;
}) {
  const targetLabel = label ?? code ?? "row";
  const [open, setOpen] = useState(false);
  const content = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // The menu is anchored to a row inside a table that scrolls on its own. It
  // keeps tracking that row, so a scroll carries it out of the table and over
  // the toolbar above while the row itself is clipped away. The menu belongs
  // to a row that is no longer where it was, so it closes rather than chases.
  // Scrolling within the menu's own list is not that, and is left alone.
  useEffect(() => {
    if (!open) return;
    function closeOnScrollAway(event: Event) {
      const target = event.target;
      if (target instanceof Node && content.current?.contains(target)) return;
      setOpen(false);
    }
    // Scroll does not bubble, so the capture phase is the only way to hear a
    // scroll from a container this component does not own.
    document.addEventListener("scroll", closeOnScrollAway, true);
    return () =>
      document.removeEventListener("scroll", closeOnScrollAway, true);
  }, [open]);
  const items = links.map((link, index) => ({
    value: String(index),
    label: link.label,
    icon:
      link.icon === "source" ? (
        <ExternalLink />
      ) : link.icon === "history" ? (
        <History />
      ) : (
        <Eye />
      ),
  }));
  if (code) items.push({ value: "copy", label: "Copy code", icon: <Copy /> });
  extraActions.forEach((action, index) =>
    items.push({
      value: `extra-${index}`,
      label: action.label,
      icon: <>{action.icon}</>,
    }),
  );
  if (onSelectForImport)
    items.push({
      value: "select",
      label: "Select for import",
      icon: <RefreshCw />,
    });
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          // The trigger sits on a row that highlights on hover, so it needs a
          // ground of its own to separate from, and a held state while its
          // menu is open to show which row the menu belongs to.
          className="text-muted-foreground hover:bg-foreground/10 hover:text-foreground data-[state=open]:bg-foreground/10 data-[state=open]:text-foreground"
          disabled={disabled}
          aria-label={`Actions for ${targetLabel}`}
          size="icon-sm"
          variant="ghost"
        >
          <MoreVertical aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        aria-label={`Actions for ${targetLabel}`}
        align="end"
        className={styles.actions}
        ref={content}
      >
        <OptionMenu
          items={items}
          value={null}
          onSelect={(value) => {
            setOpen(false);
            if (value === "copy" && code) {
              void navigator.clipboard.writeText(code).then(
                () => toast.success("Code copied"),
                () => toast.error("Could not copy the code"),
              );
            } else if (value.startsWith("extra-"))
              extraActions[Number(value.slice(6))]?.onSelect();
            else if (value === "select") onSelectForImport?.();
            else {
              const link = links[Number(value)];
              if (link.href.startsWith("https://"))
                window.open(link.href, "_blank", "noopener,noreferrer");
              else router.push(link.href);
            }
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
