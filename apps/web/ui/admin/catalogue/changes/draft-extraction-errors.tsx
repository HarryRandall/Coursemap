"use client";

import { useTransition } from "react";
import { Button } from "@coursemap/ui/primitives/button";
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
  return (
    <Alert variant="destructive">
      <CircleAlert aria-hidden="true" />
      <AlertTitle>Draft extraction errors</AlertTitle>
      <AlertDescription>
        <p className="mt-1">
          Compare each part with ANU, correct the draft, then mark its error
          reviewed.
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
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isPending || hasPendingReview || !flag.fieldPath}
                  onClick={() =>
                    startTransition(async () => {
                      try {
                        await resolveExtractionError(index);
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
                  Mark corrected
                </Button>
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
