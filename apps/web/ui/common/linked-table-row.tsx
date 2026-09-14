import type { ComponentProps } from "react";
import { TableRow } from "@coursemap/ui/primitives/table";
import { cn } from "@/lib/cn";
import styles from "./linked-table-row.module.css";

/** Stretches the primary link across the row while keeping controls above it. */
export function LinkedTableRow({
  className,
  ...props
}: ComponentProps<typeof TableRow>) {
  return <TableRow {...props} className={cn(styles.row, className)} />;
}
