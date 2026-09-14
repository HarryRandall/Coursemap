"use client";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@coursemap/ui/primitives/button";
import { Check, CircleAlert, Sparkles, Undo2 } from "lucide-react";
import { ConfirmDialog } from "@/ui/common/confirm-dialog";
import { reviewCatalogueSections } from "@/lib/coursemap/catalogue-section-review-actions";
import type { CatalogueSectionReview } from "@/lib/coursemap/catalogue-section-review";

export function useCatalogueApproval(input: {
  kind: string;
  yearId: number;
  snapshotId: number;
  sections: CatalogueSectionReview;
}) {
  const [pending, setPending] = useState(false);
  const saving = useRef(false);
  const [state, setState] = useState({
    source: input.sections,
    snapshotId: input.snapshotId,
    sections: input.sections,
  });
  if (
    state.snapshotId !== input.snapshotId ||
    (!pending && state.source !== input.sections)
  ) {
    setState({
      source: input.sections,
      snapshotId: input.snapshotId,
      sections: input.sections,
    });
  }
  async function approve(sections: string[], approved: boolean, bulk = false) {
    if (saving.current) return;
    saving.current = true;
    const previous = state;
    setState({
      ...state,
      sections: state.sections.map((section) =>
        sections.includes(section.key) ? { ...section, approved } : section,
      ),
    });
    setPending(true);
    try {
      const saved = await reviewCatalogueSections({
        ...input,
        sections,
        approved,
        bulk,
      });
      setState({ ...previous, sections: saved });
    } catch (error) {
      setState(previous);
      toast.error(
        error instanceof Error
          ? error.message
          : "The approval could not be saved.",
      );
    } finally {
      saving.current = false;
      setPending(false);
    }
  }
  return {
    sections: state.sections,
    pending,
    approve,
    complete:
      !pending &&
      state.sections.length > 0 &&
      state.sections.every((section) => section.approved),
  };
}

export function SectionApproval({
  section,
  disabled,
  onApprove,
}: {
  section?: CatalogueSectionReview[number];
  disabled: boolean;
  onApprove: (approved: boolean) => void;
}) {
  if (!section) return null;
  const reason =
    section.reason ??
    (section.eligible
      ? "Source evidence verified"
      : ["requisites", "requirements"].includes(section.key)
        ? "Requirements need manual review"
        : "Source evidence needs checking");
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-sm">
        {section.approved ? (
          <Check className="size-4 text-emerald-600" aria-hidden="true" />
        ) : section.eligible ? (
          <Sparkles className="size-4 text-primary" aria-hidden="true" />
        ) : (
          <CircleAlert className="size-4 text-amber-600" aria-hidden="true" />
        )}
        <span
          className={
            section.approved
              ? "font-medium text-emerald-700 dark:text-emerald-400"
              : "text-muted-foreground"
          }
        >
          {section.approved ? "Section approved" : reason}
        </span>
      </div>
      <Button
        size="sm"
        variant={section.approved ? "ghost" : "outline"}
        disabled={disabled}
        onClick={() => onApprove(!section.approved)}
      >
        {section.approved ? (
          <Undo2 className="size-4" aria-hidden="true" />
        ) : (
          <Check className="size-4" aria-hidden="true" />
        )}
        {section.approved ? "Undo approval" : "Approve section"}
      </Button>
    </div>
  );
}

export function BulkSectionApproval({
  sections,
  disabled,
  onApprove,
}: {
  sections: CatalogueSectionReview;
  disabled: boolean;
  onApprove: (keys: string[], bulk: boolean) => void;
}) {
  const remaining = sections.filter((section) => !section.approved);
  const eligible = remaining.filter((section) => section.eligible);
  const flagged = remaining.length - eligible.length;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="text-sm">
        <span className="font-medium">
          {sections.length - remaining.length} of {sections.length} approved
        </span>
        {remaining.length ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {eligible.length} source-verified
            {flagged ? ` · ${flagged} need manual review` : ""}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {eligible.length ? (
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() =>
              onApprove(
                eligible.map((section) => section.key),
                true,
              )
            }
          >
            <Sparkles className="size-4" aria-hidden="true" />
            Approve verified ({eligible.length})
          </Button>
        ) : null}
        {remaining.length ? (
          <ConfirmDialog
            title="Approve remaining sections?"
            description={`Confirm you have checked the ${remaining.length} remaining sections${flagged ? `, including ${flagged} requiring manual review` : ""}. Publishing remains a separate step.`}
            confirmLabel="Approve remaining"
            trigger={
              <Button size="sm" variant="outline" disabled={disabled}>
                Approve remaining ({remaining.length})
              </Button>
            }
            onConfirm={() =>
              onApprove(
                remaining.map((section) => section.key),
                false,
              )
            }
          />
        ) : null}
      </div>
    </div>
  );
}
