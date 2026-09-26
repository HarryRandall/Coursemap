"use client";

import type { ComponentProps } from "react";
import { TabsList } from "@coursemap/ui/primitives/tabs";
import { cn } from "@/lib/cn";
import styles from "./outlined-tabs-list.module.css";

/** Use inside Tabs with TabsTrigger children; className styles the scrolling container. */
export function OutlinedTabsList({
  className,
  ...props
}: Omit<ComponentProps<typeof TabsList>, "variant">) {
  return (
    <div className={cn(styles.tabs, className)}>
      <TabsList {...props} variant="line" />
    </div>
  );
}
