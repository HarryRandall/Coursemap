import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

function pageHref({
  pathname,
  searchParams,
  page,
}: {
  pathname: string;
  searchParams: Record<string, string | undefined>;
  page: number;
}) {
  const params = new URLSearchParams(
    Object.entries(searchParams).flatMap(([key, value]) =>
      value && key !== "page" ? [[key, value]] : [],
    ),
  );
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/**
 * First page, last page, and the current page with a neighbour either side.
 * Gaps become an ellipsis so the control keeps a fixed width as pages change.
 */
function pageWindow(page: number, pageCount: number): Array<number | "gap"> {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }
  const pages = new Set([1, pageCount, page - 1, page, page + 1]);
  const visible = [...pages]
    .filter((value) => value >= 1 && value <= pageCount)
    .sort((left, right) => left - right);
  return visible.flatMap((value, index) =>
    index > 0 && value - visible[index - 1] > 1
      ? (["gap", value] as Array<number | "gap">)
      : [value],
  );
}

/**
 * Callers name their rows in the plural, which is what a count almost always
 * needs. One row is the exception, and "1 courses" is worth the two lines.
 */
function countedName(itemName: string, total: number) {
  if (total !== 1 || !itemName.endsWith("s")) return itemName;
  return itemName.slice(0, -1);
}

const stepClasses =
  "grid size-8 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

export function Pagination({
  pathname = "",
  searchParams = {},
  onPageChange,
  page,
  pageSize,
  total,
  itemName,
  alwaysShowControls = false,
}: {
  page: number;
  pageSize: number;
  total: number;
  itemName: string;
  /** Keep previous/next visible even on a single page, disabled when blocked. */
  alwaysShowControls?: boolean;
} & (
  | {
      pathname: string;
      searchParams: Record<string, string | undefined>;
      onPageChange?: never;
    }
  | {
      pathname?: never;
      searchParams?: never;
      onPageChange: (page: number) => void;
    }
)) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, total);
  const href = (target: number) =>
    pageHref({ pathname, searchParams, page: target });
  const control = (target: number, className: string, children: ReactNode) =>
    onPageChange ? (
      <button
        type="button"
        className={className}
        onClick={() => onPageChange(target)}
        key={target}
      >
        {children}
      </button>
    ) : (
      <Link className={className} href={href(target)} key={target}>
        {children}
      </Link>
    );
  const showControls = alwaysShowControls || pageCount > 1;

  return (
    <nav
      aria-label={`${itemName} pagination`}
      className="flex flex-wrap items-center justify-between gap-3"
    >
      <p className="text-xs font-medium text-muted-foreground tabular-nums">
        {total === 0 ? (
          <span className="text-muted-foreground/80">No {itemName}</span>
        ) : pageCount === 1 ? (
          <>
            {total.toLocaleString("en-AU")}{" "}
            <span className="font-normal text-muted-foreground">
              {countedName(itemName, total)}
            </span>
          </>
        ) : (
          <>
            {start.toLocaleString("en-AU")}–{end.toLocaleString("en-AU")}{" "}
            <span className="font-normal text-muted-foreground">
              of {total.toLocaleString("en-AU")}
            </span>
          </>
        )}
      </p>
      {showControls ? (
        <div className="ml-auto flex items-center gap-0.5">
          {safePage > 1 ? (
            control(
              safePage - 1,
              stepClasses,
              <>
                <ChevronLeft aria-hidden="true" size={16} />
                <span className="sr-only">Previous page</span>
              </>,
            )
          ) : (
            <span
              aria-disabled="true"
              className={cn(
                stepClasses,
                "pointer-events-none text-muted-foreground/60",
              )}
            >
              <ChevronLeft aria-hidden="true" size={16} />
              <span className="sr-only">Previous page unavailable</span>
            </span>
          )}

          {pageCount > 1 ? (
            pageWindow(safePage, pageCount).map((entry, index) =>
              entry === "gap" ? (
                <span
                  aria-hidden="true"
                  className="grid size-8 place-items-center text-xs text-muted-foreground/80"
                  key={`gap-${index}`}
                >
                  &hellip;
                </span>
              ) : entry === safePage ? (
                <span
                  aria-current="page"
                  className="grid size-8 place-items-center rounded-md bg-primary text-xs font-semibold text-primary-foreground tabular-nums"
                  key={entry}
                >
                  {entry}
                </span>
              ) : (
                control(
                  entry,
                  "grid size-8 cursor-pointer place-items-center rounded-md text-xs font-medium text-muted-foreground tabular-nums transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  <>
                    <span className="sr-only">Page </span>
                    {entry}
                  </>,
                )
              ),
            )
          ) : (
            <span
              aria-current="page"
              className="grid size-8 place-items-center rounded-md bg-primary text-xs font-semibold text-primary-foreground tabular-nums"
            >
              1
            </span>
          )}

          {safePage < pageCount && total > 0 ? (
            control(
              safePage + 1,
              stepClasses,
              <>
                <ChevronRight aria-hidden="true" size={16} />
                <span className="sr-only">Next page</span>
              </>,
            )
          ) : (
            <span
              aria-disabled="true"
              className={cn(
                stepClasses,
                "pointer-events-none text-muted-foreground/60",
              )}
            >
              <ChevronRight aria-hidden="true" size={16} />
              <span className="sr-only">Next page unavailable</span>
            </span>
          )}
        </div>
      ) : null}
    </nav>
  );
}
