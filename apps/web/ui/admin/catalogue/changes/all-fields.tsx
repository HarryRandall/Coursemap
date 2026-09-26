import { Badge } from "@coursemap/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coursemap/ui/primitives/table";
import type { FirstReadItem } from "@/lib/catalogue/first-read";
import { fieldLabel } from "@/lib/coursemap/catalogue-kinds";
import { plainText } from "./review-value";

function summary(item: FirstReadItem) {
  if (item.unitKind === "requirement_rule") {
    const rule = (item.value as { rule?: { sourceText?: string } } | null)
      ?.rule;
    return rule?.sourceText?.trim() ?? "";
  }
  if (Array.isArray(item.value)) {
    return `${item.value.length} item${item.value.length === 1 ? "" : "s"}`;
  }
  const text = plainText(item.value);
  return text.length > 140 ? `${text.slice(0, 137)}…` : text;
}

/**
 * Every filled field of the record as ANU was read, with how sure the reading
 * was, including those taken as read and never put up for review.
 */
export function AllFields({
  items,
  openPaths,
}: {
  items: readonly FirstReadItem[];
  /** Fields with a change still waiting on a decision. */
  openPaths: ReadonlySet<string>;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <Table aria-label="All fields">
        <TableHeader>
          <TableRow>
            <TableHead>Field</TableHead>
            <TableHead>Value</TableHead>
            <TableHead className="text-right">Confidence</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.fieldPath}>
              <TableCell className="align-top font-medium">
                {fieldLabel(item.fieldPath)}
              </TableCell>
              <TableCell className="max-w-xl align-top whitespace-normal text-muted-foreground">
                {summary(item)}
              </TableCell>
              <TableCell className="text-right align-top tabular-nums">
                {item.confidence === null
                  ? "None given"
                  : `${Math.round(item.confidence * 100)}%`}
              </TableCell>
              <TableCell className="align-top">
                {openPaths.has(item.fieldPath) ? (
                  <Badge variant="warning-light">To review</Badge>
                ) : (
                  <Badge variant="outline">Settled</Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
