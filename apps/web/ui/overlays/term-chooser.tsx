"use client";
import { badgeVariantForTone } from "@/lib/ui";

import { useReturnFocus } from "@/hooks/use-return-focus";
import { Alert, AlertDescription } from "@coursemap/ui/components/alert";
import { Button } from "@coursemap/ui/primitives/button";
import { Badge } from "@coursemap/ui/components/badge";
import { Skeleton } from "@coursemap/ui/primitives/skeleton";
import { cn } from "@/lib/cn";

import { ArrowRight, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useCoursemap } from "@/app/providers";
import type { CourseDetails } from "@/lib/coursemap/course-types";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@coursemap/ui/primitives/dialog";

export function TermChooser({
  course,
  onClose,
}: {
  course: Pick<CourseDetails, "code" | "name" | "sessions" | "year">;
  onClose: () => void;
}) {
  const restoreFocus = useReturnFocus();
  const { addCourse, notify } = useCoursemap();
  const [terms, setTerms] = useState<
    Array<{ id: string; year: number; name: string; dates: string }>
  >([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function loadTerms() {
      try {
        const response = await fetch("/api/plan/periods", {
          signal: controller.signal,
        });
        const payload = (await response.json()) as {
          error?: string;
          terms?: Array<{
            id: string;
            year: number;
            name: string;
            dates: string;
          }>;
        };
        if (!response.ok || !payload.terms) {
          throw new Error(payload.error ?? "Semester options are unavailable.");
        }
        setTerms(payload.terms);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Semester options are unavailable.",
        );
      }
    }
    void loadTerms();
    return () => controller.abort();
  }, []);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        {...restoreFocus}
        showCloseButton={false}
        aria-labelledby={"term-dialog-title"}
        aria-describedby={undefined}
        className={"w-full max-w-md"}
      >
        <header className="flex items-center justify-between border-b border-border/60 px-5 py-4">
          <div>
            <p className="text-[11px] font-bold tracking-wider text-muted-foreground/80 uppercase">
              {course.code}
            </p>
            <DialogTitle asChild>
              <h2
                id="term-dialog-title"
                className="mt-0.5 text-lg font-bold tracking-tight text-foreground"
              >
                Choose a semester
              </h2>
            </DialogTitle>
          </div>
          <Button
            onClick={onClose}
            variant="outline"
            aria-label={"Close semester chooser"}
            title={"Close semester chooser"}
            size="icon"
            type="button"
          >
            <X size={18} />
          </Button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto p-2">
          {error ? (
            <Alert role="alert" className="m-3 w-auto" variant={"destructive"}>
              <X />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : terms.length === 0 ? (
            <div className="space-y-2 p-2" aria-busy="true">
              <span className="sr-only">Loading available semesters</span>
              {Array.from({ length: 3 }, (_, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 rounded-lg px-3 py-3"
                >
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-3 w-44" />
                  </div>
                  <Skeleton className="h-5 w-16" />
                </div>
              ))}
            </div>
          ) : (
            terms
              .filter((term) => term.year === course.year)
              .map((term) => {
                const available = course.sessions.includes(term.name);
                return (
                  <Button
                    key={term.id}
                    variant="ghost"
                    onClick={async () => {
                      const result = await addCourse(
                        course.code,
                        term.id,
                        course.year,
                      );
                      notify(result.message, result.ok ? "success" : "warning");
                      if (result.ok) onClose();
                    }}
                    className={cn(
                      "h-auto justify-start rounded-lg px-3 py-3 text-left",
                      "w-full",
                    )}
                    type="button"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold text-foreground">
                        {term.name}
                        {` ${term.year}`}
                      </span>
                      {term.dates ? (
                        <span className="block text-xs text-muted-foreground">
                          {term.dates}
                        </span>
                      ) : null}
                    </span>
                    <Badge
                      variant={
                        badgeVariantForTone[available ? "success" : "neutral"]
                      }
                    >
                      {available ? "Offered" : "Not listed"}
                    </Badge>
                    <ArrowRight
                      size={16}
                      className="text-muted-foreground/60"
                    />
                  </Button>
                );
              })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
