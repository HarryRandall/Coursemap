"use client";

import { Button } from "@coursemap/ui/primitives/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@coursemap/ui/primitives/select";
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
import {
  approveFirstReadAction,
  markFieldForReviewAction,
} from "@/lib/coursemap/admin-catalogue-actions";
import { Pencil } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
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

/** An open change on a field, and whether approving it settles the field. */
export type OpenField = { changeId: number; approvable: boolean };

function StatusSelect({
  item,
  open,
  recordId,
  path,
  canWrite,
}: {
  item: FirstReadItem;
  open: OpenField | undefined;
  recordId: number;
  path: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const status = open ? "review" : "settled";
  const label = fieldLabel(item.fieldPath);
  const change = (next: string) => {
    if (next === status) return;
    startTransition(async () => {
      const result =
        next === "review"
          ? await markFieldForReviewAction({
              recordId,
              fieldPath: item.fieldPath,
              path,
            })
          : await approveFirstReadAction({
              recordId,
              changeIds: [open!.changeId],
              path,
            });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.message) toast.success(result.message);
      router.refresh();
    });
  };
  // Settling a conflict or an ANU change needs its choice on the card, so
  // only a first reading can be settled from here.
  const locked =
    !canWrite || isPending || (open !== undefined && !open.approvable);
  return (
    <Select value={status} onValueChange={change} disabled={locked}>
      <SelectTrigger className="w-32" aria-label={`Status of ${label}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="review">To review</SelectItem>
        <SelectItem value="settled">Settled</SelectItem>
      </SelectContent>
    </Select>
  );
}

/**
 * Every filled field of the record as ANU was read, with how sure the reading
 * was, including those taken as read and never put up for review. A field can
 * be sent back for review or settled here, and edited on the Content tab.
 */
export function AllFields({
  items,
  open,
  recordId,
  path,
  canWrite,
}: {
  items: readonly FirstReadItem[];
  /** Fields with a change still waiting on a decision, by field path. */
  open: Readonly<Record<string, OpenField>>;
  recordId: number;
  path: string;
  canWrite: boolean;
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
            {canWrite ? (
              <TableHead>
                <span className="sr-only">Edit</span>
              </TableHead>
            ) : null}
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
                <StatusSelect
                  canWrite={canWrite}
                  item={item}
                  open={open[item.fieldPath]}
                  path={path}
                  recordId={recordId}
                />
              </TableCell>
              {canWrite ? (
                <TableCell className="text-right align-top">
                  {/* Fields are edited where they live, in the Content tab. */}
                  <Button asChild variant="ghost" size="sm">
                    <Link
                      href={path}
                      aria-label={`Edit ${fieldLabel(item.fieldPath)} in Content`}
                    >
                      <Pencil aria-hidden="true" /> Edit
                    </Link>
                  </Button>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
