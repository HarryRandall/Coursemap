"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, type LucideIcon } from "lucide-react";
import { Fragment, useLayoutEffect, useRef, useState } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@coursemap/ui/primitives/breadcrumb";
import { BreadcrumbOverflow } from "@/ui/shell/breadcrumb-overflow";
import { routeIcons } from "@/ui/shell/route-icons";

type Crumb = { label: string; href?: string; icon?: LucideIcon };

const labels: Record<string, string> = {
  dashboard: "Dashboard",
  plan: "Planner",
  requirements: "Requirements",
  courses: "Explore courses",
  academic: "Academic history",
  calendar: "Calendar",
  "key-dates": "Key dates",
  roadmap: "Product roadmap",
  rooms: "Room finder",
  help: "Help centre",
  timetable: "Timetable",
  profile: "Profile",
  admin: "Admin",
  programmes: "Programmes",
  majors: "Majors",
  minors: "Minors",
  specialisations: "Specialisations",
  users: "Users",
  roles: "Roles",
  imports: "Imports",
  operations: "Operations",
  syncs: "Syncs",
  discovery: "Discovery",
  sync: "Sync",
  changes: "Changes",
};

/**
 * Each crumb carries the same icon its sidebar entry uses, read from the
 * shared route icon map. Admin dashboard and indoor maps are the two admin
 * segments whose icon differs from the student route of the same name.
 */
const icons: Record<string, LucideIcon> = routeIcons;

const COURSE_CODE_SEGMENT = /^[A-Z]{4}\d{4}[A-Z]?$/iu;

/**
 * Record identifiers carry no meaning for a reader. A page that knows the name
 * behind one supplies it through `currentLabel`, but it only knows that once
 * its data has loaded, so rendering the raw value in the meantime flashes a
 * UUID into the breadcrumb. Reserve its position with a placeholder until the name is available.
 */
const OPAQUE_ID_SEGMENT =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{24,}|\d+)$/iu;

/** An academic year is a number a reader understands, not an identifier. */
const YEAR_SEGMENT = /^(?:19|20|21)\d{2}$/u;

function isOpaqueId(segment: string) {
  return OPAQUE_ID_SEGMENT.test(segment) && !YEAR_SEGMENT.test(segment);
}

/**
 * Only course codes are shouted. Upper-casing every unmapped segment turned
 * ordinary path parts into headlines, so /admin/courses/2026 reads as
 * "IMPORTS".
 */
function fallbackLabel(segment: string) {
  const value = decodeURIComponent(segment);
  if (COURSE_CODE_SEGMENT.test(value)) return value.toUpperCase();
  const words = value.replace(/[-_]+/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function buildCrumbs(
  pathname: string,
  segmentLabels: Record<string, string | null> = {},
): { crumbs: Crumb[]; admin: boolean } {
  const segments = pathname.split("/").filter(Boolean);
  const admin = segments[0] === "admin";
  const crumbs: Crumb[] = [];
  let href = "";

  segments.forEach((segment, index) => {
    href += `/${segment}`;
    if (segmentLabels[segment] === null) return;
    const isLast = index === segments.length - 1;
    const opaque = segmentLabels[segment] === undefined && isOpaqueId(segment);
    if (opaque) {
      // Hold the position so `currentLabel` still lands on this crumb once the
      // page knows the name. Rendering shows a placeholder until then.
      crumbs.push({ label: "", href: undefined });
      return;
    }
    const isAdminDashboard = admin && segment === "dashboard";
    const isAdminRooms = admin && segment === "rooms";
    const label =
      segmentLabels[segment] ??
      (isAdminDashboard
        ? "Dashboard"
        : isAdminRooms
          ? "Indoor maps"
          : admin && segment === "courses"
            ? "Courses"
            : (labels[segment] ?? fallbackLabel(segment)));
    const icon = isAdminDashboard
      ? routeIcons["admin-dashboard"]
      : isAdminRooms
        ? routeIcons["admin-rooms"]
        : (icons[segment] ??
          (COURSE_CODE_SEGMENT.test(segment) ? BookOpen : undefined));
    crumbs.push({
      icon,
      label,
      href: isLast
        ? undefined
        : admin && index === 0
          ? "/admin/dashboard"
          : href,
    });
  });

  if (admin && segments.length === 1) {
    crumbs[0] = { label: "Admin", icon: routeIcons.admin };
  }

  return { crumbs, admin };
}

export function Breadcrumbs({
  currentLabel,
  segmentLabels,
  trailingLabel,
}: {
  currentLabel?: string;
  /** Relabels a route segment, or hides it when the value is null. */
  segmentLabels?: Record<string, string | null>;
  /**
   * The section within the page, such as the open tab. It is not a path
   * segment, so it is appended rather than read from the URL.
   */
  trailingLabel?: string;
}) {
  const pathname = usePathname();
  const { crumbs } = buildCrumbs(pathname, segmentLabels);
  const named = currentLabel
    ? crumbs.map((crumb, index) =>
        index === crumbs.length - 1 ? { ...crumb, label: currentLabel } : crumb,
      )
    : crumbs;
  const visibleCrumbs = trailingLabel
    ? [
        ...named.map((crumb, index) =>
          index === named.length - 1 && !crumb.href
            ? { ...crumb, href: pathname }
            : crumb,
        ),
        { label: trailingLabel },
      ]
    : named;

  const containerRef = useRef<HTMLElement>(null);
  const measureRef = useRef<HTMLOListElement>(null);
  const [hiddenCount, setHiddenCount] = useState(0);
  const measureKey = JSON.stringify(visibleCrumbs);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;
    function update() {
      if (!container || !measure) return;
      const width = container.getBoundingClientRect().width;
      // Layout is unavailable during server rendering and in jsdom.
      if (!width) return;
      const items = Array.from(
        measure.querySelectorAll<HTMLElement>("[data-crumb-measure]"),
      );
      const widths = items.map((item) => item.getBoundingClientRect().width);
      const gap = Number.parseFloat(getComputedStyle(measure).columnGap) || 6;
      const separator =
        measure
          .querySelector<HTMLElement>("[data-slot=breadcrumb-separator]")
          ?.getBoundingClientRect().width ?? 14;
      const between = separator + gap * 2;
      let count = 0;
      let required =
        widths.reduce((total, value) => total + value, 0) +
        Math.max(0, widths.length - 1) * between;
      while (required > width && count < widths.length - 2) {
        count += 1;
        const remaining = widths.filter(
          (_, index) => index === 0 || index > count,
        );
        // The ReUI icon-sm button is 28px wide.
        required =
          remaining.reduce((total, value) => total + value, 28) +
          remaining.length * between;
      }
      setHiddenCount(count);
    }
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    observer.observe(measure);
    return () => observer.disconnect();
  }, [measureKey]);

  function content(crumb: Crumb, measure = false) {
    return crumb.label ? (
      <>
        {crumb.icon ? (
          <crumb.icon aria-hidden="true" className="size-3.5 shrink-0" />
        ) : null}
        {measure ? (
          <span
            data-label={crumb.label}
            className="after:content-[attr(data-label)]"
          />
        ) : (
          <span className="truncate">{crumb.label}</span>
        )}
      </>
    ) : (
      <span
        aria-hidden="true"
        className="block h-3.5 w-20 animate-pulse rounded bg-muted-foreground/20"
      />
    );
  }

  const collapsed = Math.min(
    visibleCrumbs.length > 3 ? visibleCrumbs.length - 2 : hiddenCount,
    Math.max(0, visibleCrumbs.length - 2),
  );
  return (
    <Breadcrumb
      ref={containerRef}
      aria-label="Breadcrumb"
      className="relative min-w-0 flex-1"
    >
      <BreadcrumbList className="min-w-0 flex-nowrap text-[13px] leading-5 whitespace-nowrap">
        {visibleCrumbs.map((crumb, index) => {
          if (index > 0 && index <= collapsed) return null;
          const last = index === visibleCrumbs.length - 1;
          return (
            <Fragment key={index}>
              {index > 0 ? <BreadcrumbSeparator className="shrink-0" /> : null}
              {index === collapsed + 1 && collapsed > 0 ? (
                <>
                  <BreadcrumbItem className="shrink-0">
                    <BreadcrumbOverflow
                      crumbs={visibleCrumbs.slice(1, collapsed + 1)}
                    />
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className="shrink-0" />
                </>
              ) : null}
              <BreadcrumbItem className={last ? "min-w-0" : "shrink-0"}>
                {crumb.href && crumb.label ? (
                  <BreadcrumbLink
                    asChild
                    className="flex min-w-0 items-center gap-1.5 font-medium"
                  >
                    <Link href={crumb.href} title={crumb.label}>
                      {content(crumb)}
                    </Link>
                  </BreadcrumbLink>
                ) : crumb.label ? (
                  <BreadcrumbPage
                    title={crumb.label || undefined}
                    className="flex min-w-0 items-center gap-1.5 font-semibold"
                  >
                    {content(crumb)}
                  </BreadcrumbPage>
                ) : (
                  content(crumb)
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
      <div
        aria-hidden="true"
        inert
        className="pointer-events-none invisible absolute inset-x-0 top-0 h-0 overflow-hidden"
      >
        <BreadcrumbList
          ref={measureRef}
          aria-hidden="true"
          inert
          className="w-max flex-nowrap text-[13px] leading-5 whitespace-nowrap"
        >
          {visibleCrumbs.map((crumb, index) => (
            <Fragment key={index}>
              {index > 0 ? <BreadcrumbSeparator /> : null}
              <BreadcrumbItem data-crumb-measure className="shrink-0">
                <span
                  className={`flex items-center gap-1.5 ${crumb.href ? "font-medium" : "font-semibold"}`}
                >
                  {content(crumb, true)}
                </span>
              </BreadcrumbItem>
            </Fragment>
          ))}
        </BreadcrumbList>
      </div>
    </Breadcrumb>
  );
}
