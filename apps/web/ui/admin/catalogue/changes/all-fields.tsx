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
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { FieldEditDialog } from "./field-edit-dialog";
import { Badge } from "@coursemap/ui/components/badge";
import { ReviewValue } from "./review-value";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@coursemap/ui/primitives/collapsible";
import { ChevronDown } from "lucide-react";
import { plainText } from "./review-value";
import { showToast } from "@/ui/common/toast";

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
  canWrite,
}: {
  item: FirstReadItem;
  open: OpenField | undefined;
  recordId: number;
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
            })
          : await approveFirstReadAction({
              recordId,
              changeIds: [open!.changeId],
            });
      if (!result.ok) {
        showToast(result.error, "error");
        return;
      }
      if (result.message) showToast(result.message);
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
 * be sent back for review, settled or edited in place.
 */
export function AllFields({
  items,
  open,
  recordId,
  canWrite,
}: {
  items: readonly FirstReadItem[];
  /** Fields with a change still waiting on a decision, by field path. */
  open: Readonly<Record<string, OpenField>>;
  recordId: number;
  canWrite: boolean;
}) {
  const [editingField, setEditingField] = useState<string | null>(null);
  const editTrigger = useRef<HTMLButtonElement | null>(null);
  return (
    <>
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
                  {Array.isArray(item.value) ? (
                    <Collapsible>
                      <CollapsibleTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="group gap-2"
                          aria-label={`View all ${fieldLabel(item.fieldPath)}`}
                        >
                          {summary(item)}
                          <ChevronDown
                            aria-hidden="true"
                            className="size-3 transition-transform group-data-[state=open]:rotate-180"
                          />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="max-h-80 overflow-auto py-3">
                        <ReviewValue
                          label={fieldLabel(item.fieldPath)}
                          value={item.value}
                          unitKind={item.unitKind}
                        />
                      </CollapsibleContent>
                    </Collapsible>
                  ) : (
                    summary(item)
                  )}
                </TableCell>
                <TableCell className="text-right align-top tabular-nums">
                  {item.confidence === null ? (
                    <span
                      aria-label="Confidence not provided"
                      className="text-muted-foreground"
                    >
                      --
                    </span>
                  ) : (
                    <Badge variant="secondary">
                      {Math.round(item.confidence * 100)}%
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="align-top">
                  <StatusSelect
                    canWrite={canWrite}
                    item={item}
                    open={open[item.fieldPath]}
                    recordId={recordId}
                  />
                </TableCell>
                {canWrite ? (
                  <TableCell className="text-right align-top">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Edit ${fieldLabel(item.fieldPath)}`}
                      onClick={(event) => {
                        editTrigger.current = event.currentTarget;
                        setEditingField(item.fieldPath);
                      }}
                    >
                      <Pencil aria-hidden="true" /> Edit
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {editingField && (
        <FieldEditDialog
          fieldPath={editingField}
          onClose={() => setEditingField(null)}
          returnFocus={() => editTrigger.current?.focus()}
        />
      )}
    </>
  );
}
