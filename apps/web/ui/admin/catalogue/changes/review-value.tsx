import type { CatalogueReviewUnitKind } from "@/lib/catalogue/review-units";
import { JsonCode } from "@/ui/common/json-code";

type RequirementSlice = {
  rule?: { sourceText?: string | null } | null;
  conditions?: unknown[];
};

function itemCount(value: unknown[]) {
  return `${value.length} item${value.length === 1 ? "" : "s"}`;
}

function scalarText(value: unknown) {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

/**
 * One side of a comparison. Scalars read as themselves, a requirement rule
 * leads with the wording ANU published, and a collection states its size with
 * the full value behind a disclosure, because no administrator reads twelve
 * assessment rows as prose.
 */
export function ReviewValue({
  label,
  value,
  unitKind,
  note,
}: {
  label: string;
  value: unknown;
  unitKind: CatalogueReviewUnitKind;
  note?: string;
}) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <div className="mt-1 min-w-0 text-sm break-words">
        {empty ? (
          <span className="text-muted-foreground italic">Not set</span>
        ) : unitKind === "scalar" ? (
          <span className="whitespace-pre-wrap">{scalarText(value)}</span>
        ) : unitKind === "requirement_rule" ? (
          <RequirementValue label={label} value={value as RequirementSlice} />
        ) : (
          <CollectionValue label={label} value={value} />
        )}
      </div>
      {note ? (
        <p className="mt-1 text-xs text-muted-foreground">{note}</p>
      ) : null}
    </div>
  );
}

function RequirementValue({
  label,
  value,
}: {
  label: string;
  value: RequirementSlice;
}) {
  const wording = value.rule?.sourceText?.trim();
  const conditions = value.conditions?.length ?? 0;
  return (
    <>
      {wording ? (
        <p className="whitespace-pre-wrap">{wording}</p>
      ) : (
        <p className="text-muted-foreground italic">No published wording</p>
      )}
      <ValueDetails
        label={label}
        summary={`${conditions} condition${conditions === 1 ? "" : "s"}`}
        value={value}
      />
    </>
  );
}

function CollectionValue({ label, value }: { label: string; value: unknown }) {
  return (
    <ValueDetails
      label={label}
      summary={Array.isArray(value) ? itemCount(value) : "One entry"}
      value={value}
      open={false}
      alwaysShow
    />
  );
}

function ValueDetails({
  label,
  summary,
  value,
  open = false,
  alwaysShow = false,
}: {
  label: string;
  summary: string;
  value: unknown;
  open?: boolean;
  alwaysShow?: boolean;
}) {
  return (
    <details className={alwaysShow ? "" : "mt-1"} open={open}>
      <summary className="cursor-pointer text-sm text-muted-foreground underline-offset-4 hover:underline">
        {summary}
      </summary>
      <div className="mt-2 overflow-hidden rounded-lg border border-border">
        <JsonCode label={`${label} detail`} value={value} borderTop={false} />
      </div>
    </details>
  );
}
