"use client";

import { useState, useTransition } from "react";
import { Button } from "@coursemap/ui/primitives/button";
import { Textarea } from "@coursemap/ui/primitives/textarea";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@coursemap/ui/components/alert";
import { CircleAlert } from "lucide-react";
import type { CatalogueContentFlag } from "@/lib/catalogue/content";
import { modelFieldLabel } from "@/lib/catalogue/review-notes";
import { useCatalogueEditor } from "../catalogue-editor-context";
import { showToast } from "@/ui/common/toast";

function ExtractionErrorList({
  errors,
  canWrite,
  hasPendingReview,
}: {
  errors: Array<{ flag: CatalogueContentFlag; index: number }>;
  canWrite: boolean;
  hasPendingReview: boolean;
}) {
  const { resolveExtractionError } = useCatalogueEditor();
  const [isPending, startTransition] = useTransition();
  const [reasons, setReasons] = useState<Record<number, string>>({});
  return (
    <Alert variant="destructive">
      <CircleAlert aria-hidden="true" />
      <AlertTitle>Draft extraction errors</AlertTitle>
      <AlertDescription>
        <p className="mt-1">
          Compare each part with ANU. Correct the draft, or explain why the
          existing wording safely represents it, before marking an error
          reviewed. Leave ambiguous requirements open.
        </p>
        <ul className="mt-3 flex flex-col gap-4">
          {errors.map(({ flag, index }) => (
            <li key={`${index}-${flag.code}`} className="space-y-2">
              <div>
                <span className="font-medium text-foreground">
                  {modelFieldLabel(flag.fieldPath)}:
                </span>{" "}
                {flag.message}
              </div>
              {flag.sourceExcerpt ? (
                <blockquote className="border-l-2 border-border pl-3 text-muted-foreground">
                  {flag.sourceExcerpt}
                </blockquote>
              ) : null}
              {canWrite ? (
                <div className="space-y-2">
                  <label
                    className="block text-xs font-medium"
                    htmlFor={`error-reason-${index}`}
                  >
                    Review explanation, if the draft already represents this
                    wording
                  </label>
                  <Textarea
                    id={`error-reason-${index}`}
                    rows={2}
                    maxLength={500}
                    value={reasons[index] ?? ""}
                    onChange={(event) =>
                      setReasons((current) => ({
                        ...current,
                        [index]: event.target.value,
                      }))
                    }
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isPending || hasPendingReview || !flag.fieldPath}
                    onClick={() =>
                      startTransition(async () => {
                        try {
                          await resolveExtractionError(index, reasons[index]);
                        } catch (error) {
                          showToast(
                            error instanceof Error
                              ? error.message
                              : "The error could not be reviewed.",
                            "error",
                          );
                        }
                      })
                    }
                  >
                    Mark reviewed
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

export function DraftExtractionErrors({
  errors,
  canWrite,
  hasPendingReview,
}: {
  errors: Array<{ flag: CatalogueContentFlag; index: number }>;
  canWrite: boolean;
  hasPendingReview: boolean;
}) {
  if (errors.length === 0) return null;
  return (
    <ExtractionErrorList
      errors={errors}
      canWrite={canWrite}
      hasPendingReview={hasPendingReview}
    />
  );
}
