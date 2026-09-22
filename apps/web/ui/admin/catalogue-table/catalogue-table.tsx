"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  BookOpen,
  GraduationCap,
  Layers,
  Code2,
  ChartNoAxesColumn,
  Atom,
  Cpu,
  Landmark,
  Globe,
  Scale,
} from "lucide-react";
import type { CatalogueTableLayout } from "@/lib/coursemap/catalogue-kinds";
import styles from "./catalogue-table.module.css";

export {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coursemap/ui/primitives/table";

/** The body owns both scroll axes; the heading and pagination never scroll vertically. */
export function DataTableShell({
  children,
  footer,
  selectable = true,
  imports = false,
  layout,
}: {
  children: ReactNode;
  footer?: ReactNode;
  selectable?: boolean;
  imports?: boolean;
  layout?: CatalogueTableLayout;
}) {
  return (
    <div
      className={styles.shell}
      data-layout={layout}
      data-imports={imports}
      data-selectable={selectable}
    >
      <div
        className={styles.viewport}
        onScrollCapture={(event) => {
          const body = event.target;
          if (body instanceof HTMLElement && body.tagName === "TBODY") {
            const header = body.closest("table")?.querySelector("thead");
            if (header) header.scrollLeft = body.scrollLeft;
          }
        }}
      >
        {children}
      </div>
      {footer ? <div className={styles.footer}>{footer}</div> : null}
    </div>
  );
}

export function CatalogueIdentity({
  code,
  title,
  kind = "course",
  href,
  meta = [],
  unavailable = false,
}: {
  code: string;
  title: string;
  kind?: string;
  href?: string;
  /** Facts that belong beside the code rather than in a column of their own. */
  meta?: string[];
  unavailable?: boolean;
}) {
  const subjectIcons = {
    COMP: Code2,
    STAT: ChartNoAxesColumn,
    MATH: ChartNoAxesColumn,
    PHYS: Atom,
    ENGN: Cpu,
    BUSN: Landmark,
    ECON: ChartNoAxesColumn,
    LAWS: Scale,
    INTR: Globe,
  };
  const courseIcon =
    subjectIcons[code.slice(0, 4) as keyof typeof subjectIcons] ?? BookOpen;
  const Icon =
    kind === "course"
      ? courseIcon
      : kind === "programme"
        ? GraduationCap
        : kind === "specialisation"
          ? Layers
          : BookOpen;
  return (
    <div className={styles.identity}>
      <span className={styles.icon} aria-hidden="true">
        <Icon size={18} />
      </span>
      <div className={styles.identityText}>
        {href ? (
          <Link data-row-link className={styles.title} href={href}>
            {title}
          </Link>
        ) : (
          <span className={styles.title}>{title}</span>
        )}
        <span className={styles.code}>
          {[code, ...meta, ...(unavailable ? ["No longer listed"] : [])].join(
            " · ",
          )}
        </span>
      </div>
    </div>
  );
}
